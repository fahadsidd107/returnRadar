"""Live reliability checks; pauses only this project's Kafka service during outage test."""
import json, os, subprocess, time, unittest, urllib.request, uuid
import test_api as api
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORKER=os.path.join(ROOT,'backend/target/debug/radar-worker')
ENV={**os.environ,'DATABASE_URL':api.DB,'S3_ENDPOINT':'http://localhost:59000','S3_ACCESS_KEY':'radar-local','S3_SECRET_KEY':'local-development-only'}
COMPOSE=['docker','compose','-f',os.path.join(ROOT,'infra/compose/compose.yaml')]
def once(mode):subprocess.run([WORKER,mode,'--once'],env=ENV,check=True,stdout=subprocess.DEVNULL,timeout=30)
def wait(predicate,seconds=30):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        if predicate():return
        time.sleep(.25)
    raise AssertionError('durable state did not converge within timeout')
class Workers(unittest.TestCase):
 def setUp(self):self.fixture=api.ApiTests();self.fixture.setUp();self.token=self.fixture.a['token']
 def tearDown(self):self.fixture.tearDown()
 def schedule(self,pid):return api.gql('mutation($p:String!){scheduleReminder(purchaseId:$p,kind:"decision",dueAt:"2027-01-01T09:00:00Z")}',{'p':pid},self.token)['scheduleReminder']
 def test_scheduler_dedup_and_stale_deadline_cancellation(self):
    api.gql('mutation{updateNotificationPreferences(timezone:"Europe/Berlin",pushEnabled:false,quietStart:0,quietEnd:0)}',token=self.token)
    pid=self.fixture.purchase();mid=self.schedule(pid);api.sql("UPDATE reminders SET due_at=now()-interval '1 second' WHERE id='"+mid+"'")
    once('scheduler');once('scheduler');self.assertEqual(api.sql("SELECT count(*) FROM notifications WHERE reminder_id='"+mid+"'"),'1');self.assertEqual(len(api.gql('{notifications{id}}',token=self.fixture.b['token'])['notifications']),0)
    pid2=self.fixture.purchase();stale=self.schedule(pid2);api.gql('mutation($p:String!){updatePurchase(purchaseId:$p,version:1,merchant:"Store",item:"Changed",deadline:"2026-12-10",notes:"")}',{'p':pid2},self.token);api.sql("UPDATE reminders SET due_at=now()-interval '1 second' WHERE id='"+stale+"'");once('scheduler');self.assertEqual(api.sql("SELECT state FROM reminders WHERE id='"+stale+"'"),'cancelled');self.assertEqual(api.sql("SELECT count(*) FROM notifications WHERE reminder_id='"+stale+"'"),'0')
 def test_smtp_acceptance_clears_sensitive_queue_body(self):
    email=self.fixture.accounts[0];api.gql('mutation($e:String!){requestPasswordReset(email:$e)}',{'e':email});
    # Send all pending local test mail, because the worker intentionally claims a global queue.
    for _ in range(20):
        if api.sql("SELECT count(*) FROM mail_queue WHERE sent_at IS NULL")== '0':break
        once('mail')
    self.assertEqual(api.sql("SELECT count(*) FROM mail_queue WHERE recipient='"+email+"' AND sent_at IS NULL"),'0');self.assertEqual(api.sql("SELECT count(*) FROM mail_queue WHERE recipient='"+email+"' AND body!=''"),'0')
    result=json.load(urllib.request.urlopen('http://localhost:58025/api/v1/messages'));self.assertGreater(result['total'],0)
 def test_kafka_outage_then_recovery_and_duplicate_event(self):
    try:
        subprocess.run(COMPOSE+['stop','kafka'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        pid=self.fixture.purchase();self.assertEqual(api.sql("SELECT count(*) FROM outbox WHERE aggregate_id='"+pid+"' AND published_at IS NULL"),'1')
        once('outbox');self.assertEqual(api.sql("SELECT count(*) FROM outbox WHERE aggregate_id='"+pid+"' AND published_at IS NULL"),'1')
    finally:subprocess.run(COMPOSE+['up','-d','--wait','kafka'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=90)
    api.sql("UPDATE outbox SET next_attempt_at=now() WHERE aggregate_id='"+pid+"'")
    for _ in range(5):
        once('outbox')
        if api.sql("SELECT count(*) FROM outbox WHERE aggregate_id='"+pid+"' AND published_at IS NULL")=='0':break
    wait(lambda:api.sql("SELECT count(*) FROM event_activity WHERE aggregate_id='"+pid+"'")=='1')
    e=json.loads(api.sql("SELECT jsonb_build_object('id',id,'aggregateId',aggregate_id,'kind',kind,'schemaVersion',schema_version,'occurredAt',created_at,'payload',payload) FROM outbox WHERE aggregate_id='"+pid+"'"));eid=e['id']
    producer=COMPOSE+['exec','-T','kafka','/opt/kafka/bin/kafka-console-producer.sh','--bootstrap-server','kafka:19092','--topic','radar.domain.v1']
    subprocess.run(producer,input=(json.dumps(e)+'\n'+json.dumps(e)+'\n').encode(),check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20)
    # A following sentinel proves the consumer moved past both duplicates.
    sentinel={**e,'id':str(uuid.uuid4())};subprocess.run(producer,input=(json.dumps(sentinel)+'\n').encode(),check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20)
    wait(lambda:api.sql("SELECT count(*) FROM event_activity WHERE event_id='"+sentinel['id']+"'")=='1');self.assertEqual(api.sql("SELECT count(*) FROM event_activity WHERE event_id='"+eid+"'"),'1');self.assertEqual(api.sql("SELECT count(*) FROM consumed_events WHERE event_id='"+eid+"'"),'1')
if __name__=='__main__':unittest.main(verbosity=2)
