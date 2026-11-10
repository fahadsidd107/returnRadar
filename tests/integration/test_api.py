"""Live API + PostgreSQL integration tests. Creates isolated accounts and deletes them."""
import json, os, re, subprocess, unittest, urllib.request, uuid
API=os.getenv('TEST_API_URL','http://localhost:4000/graphql')
DB=os.getenv('DATABASE_URL','postgres://radar:local-development-only@localhost:55432/radar')
def sql(query):
    return subprocess.check_output(['psql',DB,'-At','-c',query],text=True).strip()
def gql(query,variables=None,token=None,errors=False):
    req=urllib.request.Request(API,json.dumps({'query':query,'variables':variables or {}}).encode(),{'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
    data=json.load(urllib.request.urlopen(req))
    if errors: return data.get('errors',[])
    if data.get('errors'): raise AssertionError(data['errors'])
    return data['data']
class ApiTests(unittest.TestCase):
    def setUp(self):
        self.accounts=[];self.a=self.account();self.b=self.account()
    def account(self):
        email='integration-'+uuid.uuid4().hex+'@example.test';password='long-test-password-123'
        gql('mutation($e:String!,$p:String!){register(email:$e,password:$p)}',{'e':email,'p':password})
        self.accounts.append(email)
        token=re.search(r'token is: ([a-f0-9]+)',sql("SELECT body FROM mail_queue WHERE recipient='"+email+"' ORDER BY next_attempt_at DESC LIMIT 1")).group(1)
        gql('mutation($t:String!){verifyEmail(token:$t)}',{'t':token})
        self.assertTrue(gql('mutation($t:String!){verifyEmail(token:$t)}',{'t':token},errors=True))
        return gql('mutation($e:String!,$p:String!){signIn(email:$e,password:$p){token refreshToken}}',{'e':email,'p':password})['signIn']
    def tearDown(self):
        for email in self.accounts: sql("DELETE FROM users WHERE email='"+email+"'")
    def purchase(self,token=None):
        return gql('mutation{createPurchase(merchant:"Test store",item:"Coat",amountMinor:"12999",currency:"EUR",deadline:"2026-12-01")} ',token=token or self.a['token'])['createPurchase']
    def start(self,pid):
        return gql('mutation($id:String!){startReturn(purchaseId:$id,category:0,method:0)}',{'id':pid},self.a['token'])['startReturn']
    def advance(self,rid,state,**kwargs):
        return gql('mutation($id:String!,$s:String!,$l:String,$c:String){advanceReturn(returnId:$id,nextState:$s,label:$l,carrier:$c)}',{'id':rid,'s':state,**kwargs},self.a['token'])
    def test_ownership_and_optimistic_version(self):
        pid=self.purchase(); self.assertEqual(gql('{purchases{id}}',token=self.b['token'])['purchases'],[])
        self.assertTrue(gql('mutation($id:String!){startReturn(purchaseId:$id,category:0,method:0)}',{'id':pid},self.b['token'],errors=True))
        self.assertTrue(gql('mutation($id:String!){archivePurchase(purchaseId:$id,version:9)}',{'id':pid},self.a['token'],errors=True))
        gql('mutation($id:String!){updatePurchase(purchaseId:$id,version:1,merchant:"Updated",item:"Coat",deadline:"2026-12-02",notes:"")}',{'id':pid},self.a['token'])
        self.assertEqual(gql('{purchases{version merchant}}',token=self.a['token'])['purchases'][0]['version'],2)
    def test_refunds_and_transitions(self):
        rid=self.start(self.purchase())
        self.assertTrue(gql('mutation($id:String!){advanceReturn(returnId:$id,nextState:"resolved")}',{'id':rid},self.a['token'],errors=True))
        self.assertTrue(gql('mutation($id:String!){advanceReturn(returnId:$id,nextState:"packed")}',{'id':rid},self.a['token'],errors=True))
        self.advance(rid,'packed',l='LABEL-COAT',c='User confirmed carrier');self.advance(rid,'dropped_off');self.advance(rid,'delivered')
        for n in ['5000','7999']:gql('mutation($id:String!,$n:String!){recordRefund(returnId:$id,amountMinor:$n)}',{'id':rid,'n':n},self.a['token'])
        self.assertTrue(gql('mutation($id:String!){recordRefund(returnId:$id,amountMinor:"1")}',{'id':rid},self.a['token'],errors=True))
        self.advance(rid,'resolved');r=gql('{returns{remainingMinor receivedMinor state}}',token=self.a['token'])['returns'][0]
        self.assertEqual(r,{'remainingMinor':'0','receivedMinor':'12999','state':'resolved'})
        self.assertGreaterEqual(int(sql("SELECT count(*) FROM outbox WHERE aggregate_id='"+rid+"'")),6)
    def test_run_label_and_evidence_association(self):
        rid=self.start(self.purchase());run=gql('mutation{createReturnRun(name:"Saturday outing",plannedAt:"2026-12-01T10:00:00+01:00")}',token=self.a['token'])['createReturnRun']
        gql('mutation($run:String!,$r:String!){assignParcelToRun(runId:$run,returnId:$r,stopName:"Saved post office",position:0)}',{'run':run,'r':rid},self.a['token'])
        self.assertTrue(gql('mutation($run:String!,$r:String!){completeRunStop(runId:$run,returnId:$r,evidenceNote:"receipt 42")}',{'run':run,'r':rid},self.a['token'],errors=True))
        self.advance(rid,'packed',l='QR-42',c='Confirmed carrier')
        self.assertTrue(gql('mutation($run:String!,$r:String!){completeRunStop(runId:$run,returnId:$r,evidenceNote:"receipt 42")}',{'run':run,'r':rid},self.b['token'],errors=True))
        gql('mutation($run:String!,$r:String!){completeRunStop(runId:$run,returnId:$r,evidenceNote:"receipt 42")}',{'run':run,'r':rid},self.a['token'])
        parcels=gql('query($run:String!){runParcels(runId:$run){label evidenceNote state handedOverAt}}',{'run':run},self.a['token'])['runParcels'];self.assertEqual(parcels[0]['label'],'QR-42');self.assertEqual(parcels[0]['evidenceNote'],'receipt 42');self.assertEqual(parcels[0]['state'],'dropped_off')
    def test_refresh_logout_and_account_deletion(self):
        old=self.a['token'];ref=self.a['refreshToken'];new=gql('mutation($r:String!){refreshSession(refreshToken:$r){token refreshToken}}',{'r':ref})['refreshSession']
        self.assertTrue(gql('{purchases{id}}',token=old,errors=True));self.assertTrue(gql('mutation($r:String!){refreshSession(refreshToken:$r){token}}',{'r':ref},errors=True))
        gql('mutation{logout}',token=new['token']);self.assertTrue(gql('{purchases{id}}',token=new['token'],errors=True))
        self.purchase(token=self.b['token']);gql('mutation{deleteAccount}',token=self.b['token']);self.assertTrue(gql('{purchases{id}}',token=self.b['token'],errors=True))
    def test_vector_user_isolation_and_exact_ranking(self):
        rid=self.start(self.purchase());self.advance(rid,'packed',l='QR',c='Carrier');self.advance(rid,'dropped_off');self.advance(rid,'delivered');gql('mutation($r:String!){recordRefund(returnId:$r,amountMinor:"12999")}',{'r':rid},self.a['token']);self.advance(rid,'resolved')
        pid=self.purchase();rows=gql('query($id:String!){similarPastReturns(purchaseId:$id,category:0,method:0){returnId distance}}',{'id':pid},self.a['token'])['similarPastReturns'];self.assertEqual(rows[0]['returnId'],rid);self.assertEqual(rows[0]['distance'],0)
        self.assertTrue(gql('query($id:String!){similarPastReturns(purchaseId:$id,category:0,method:0){returnId}}',{'id':pid},self.b['token'],errors=True))
    def test_export_and_money_validation(self):
        self.purchase();export=json.loads(gql('{exportData}',token=self.a['token'])['exportData']);self.assertEqual(len(export['purchases']),1);self.assertNotIn('password_hash',str(export));self.assertEqual(json.loads(gql('{exportData}',token=self.b['token'])['exportData'])['purchases'],[])
        self.assertTrue(gql('mutation{createPurchase(merchant:"S",item:"I",amountMinor:"1.5",currency:"EUR",deadline:"2026-12-01")}',token=self.a['token'],errors=True))
        self.assertTrue(gql('mutation{createPurchase(merchant:"S",item:"I",amountMinor:"100",currency:"ZZZ",deadline:"2026-12-01")}',token=self.a['token'],errors=True))
    def test_partial_items_and_explicit_fees(self):
        pid=gql('mutation{createOrder(merchant:"Order store",currency:"KWD",deadline:"2026-12-01",items:[{name:"A",unitAmountMinor:"1250",quantity:3},{name:"B",unitAmountMinor:"3500",quantity:1}])}',token=self.a['token'])['createOrder']
        items=gql('query($p:String!){purchaseItems(purchaseId:$p){id name quantity returnedQuantity}}',{'p':pid},self.a['token'])['purchaseItems'];iid=items[0]['id']
        operation='mutation($p:String!,$i:String!,$q:Int!){startPartialReturn(purchaseId:$p,items:[{itemId:$i,quantity:$q}],category:0,method:0)}'
        rid=gql(operation,{'p':pid,'i':iid,'q':2},self.a['token'])['startPartialReturn']
        self.assertTrue(gql(operation,{'p':pid,'i':iid,'q':2},self.a['token'],errors=True))
        gql('mutation($r:String!){recordFee(returnId:$r,amountMinor:"250")}',{'r':rid},self.a['token'])
        gql('mutation($r:String!){recordRefund(returnId:$r,amountMinor:"2250")}',{'r':rid},self.a['token'])
        self.assertEqual(gql('{returns{remainingMinor}}',token=self.a['token'])['returns'][0]['remainingMinor'],'0')
        self.advance(rid,'cancelled')
        # Cancellation releases selected quantities, without allowing an active duplicate allocation.
        self.assertTrue(gql(operation,{'p':pid,'i':iid,'q':3},self.a['token'])['startPartialReturn'])
    def test_private_document_upload_validation(self):
        pid=self.purchase();content=b'%PDF-1.7\nLocal integration fixture\n%%EOF'
        op='mutation($p:String!,$n:String!){beginDocumentUpload(purchaseId:$p,purpose:"receipt",contentType:"application/pdf",byteLength:$n){documentId url}}'
        self.assertTrue(gql(op,{'p':pid,'n':str(len(content))},self.b['token'],errors=True))
        upload=gql(op,{'p':pid,'n':str(len(content))},self.a['token'])['beginDocumentUpload']
        req=urllib.request.Request(upload['url'],content,{'Content-Type':'application/pdf'},method='PUT');self.assertEqual(urllib.request.urlopen(req).status,200)
        did=upload['documentId'];gql('mutation($d:String!){finishDocumentUpload(documentId:$d)}',{'d':did},self.a['token'])
        self.assertTrue(gql('query($d:String!){documentDownloadUrl(documentId:$d)}',{'d':did},self.b['token'],errors=True))
        url=gql('query($d:String!){documentDownloadUrl(documentId:$d)}',{'d':did},self.a['token'])['documentDownloadUrl'];self.assertEqual(urllib.request.urlopen(url).read(),content)
        bad=gql(op,{'p':pid,'n':'5'},self.a['token'])['beginDocumentUpload'];urllib.request.urlopen(urllib.request.Request(bad['url'],b'bad!!',{'Content-Type':'application/pdf'},method='PUT')).close()
        self.assertTrue(gql('mutation($d:String!){finishDocumentUpload(documentId:$d)}',{'d':bad['documentId']},self.a['token'],errors=True))
        gql('mutation($d:String!){deleteDocument(documentId:$d)}',{'d':did},self.a['token']);self.assertTrue(gql('query($d:String!){documentDownloadUrl(documentId:$d)}',{'d':did},self.a['token'],errors=True))
    def test_notification_ownership_and_timezone_validation(self):
        self.assertTrue(gql('mutation{updateNotificationPreferences(timezone:"Invalid/Zone",pushEnabled:false,quietStart:22,quietEnd:8)}',token=self.a['token'],errors=True))
        gql('mutation{updateNotificationPreferences(timezone:"Europe/Berlin",pushEnabled:false,quietStart:0,quietEnd:0)}',token=self.a['token'])
        pid=self.purchase()
        self.assertTrue(gql('mutation($p:String!){scheduleReminder(purchaseId:$p,kind:"decision",dueAt:"2027-01-01T09:00:00+01:00")}',{'p':pid},self.b['token'],errors=True))
        mid=gql('mutation($p:String!){scheduleReminder(purchaseId:$p,kind:"decision",dueAt:"2027-01-01T09:00:00+01:00")}',{'p':pid},self.a['token'])['scheduleReminder']
        self.assertEqual(sql("SELECT due_at AT TIME ZONE 'UTC' FROM reminders WHERE id='"+mid+"'"),'2027-01-01 08:00:00')
if __name__=='__main__':unittest.main(verbosity=2)
