import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const db=process.env.DATABASE_URL||'postgres://radar:local-development-only@localhost:55432/radar';
const endpoint='http://localhost:4000/graphql';
const password='local-browser-test-password-123';
let email:string;
async function graphql(request:any,query:string,variables:Record<string,unknown>={}){const response=await request.post(endpoint,{data:{query,variables}});const body=await response.json();expect(body.errors).toBeUndefined();return body.data}
test.beforeEach(async({request})=>{
 email=`browser-${randomUUID()}@example.test`;
 await graphql(request,'mutation($e:String!,$p:String!){register(email:$e,password:$p)}',{e:email,p:password});
 const body=execFileSync('psql',[db,'-At','-c',`SELECT body FROM mail_queue WHERE recipient='${email}'`],{encoding:'utf8'});
 const token=/token is: ([a-f0-9]+)/.exec(body)![1];
 await graphql(request,'mutation($t:String!){verifyEmail(token:$t)}',{t:token});
});
test.afterEach(()=>{execFileSync('psql',[db,'-At','-c',`DELETE FROM users WHERE email='${email}'`],{stdio:'pipe'})});
async function login(page:any){await page.goto('/');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in'}).click();await expect(page.getByText('Signed in · This browser session only')).toBeVisible()}
test('sign in, download authoritative JSON, revoke session',async({page})=>{
 let credential='';page.on('request',r=>{if(r.url()===endpoint&&r.headers()['authorization'])credential=r.headers()['authorization']});
 await login(page);const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download my data'}).click();const download=await downloadPromise;const stream=await download.createReadStream();let text='';for await(const chunk of stream!)text+=chunk;const data=JSON.parse(text);expect(data.schemaVersion).toBe(1);expect(data.purchases).toEqual([]);expect(text).not.toContain('password_hash');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in'})).toBeVisible();
 const response=await page.request.post(endpoint,{headers:{Authorization:credential},data:{query:'{purchases{id}}'}});expect((await response.json()).errors[0].message).toBe('UNAUTHENTICATED');
});
test('account deletion requires acknowledgment and revokes access',async({page})=>{
 await login(page);await page.getByText('Delete your account',{exact:true}).click();await expect(page.getByRole('button',{name:'Delete account permanently'})).toBeDisabled();await page.getByLabel('I understand this permanently deletes my account.').check();await page.getByRole('button',{name:'Delete account permanently'}).click();await expect(page.getByRole('status')).toContainText('deleted');await expect(page.getByRole('button',{name:'Sign in'})).toBeVisible();
 expect(execFileSync('psql',[db,'-At','-c',`SELECT count(*) FROM users WHERE email='${email}'`],{encoding:'utf8'}).trim()).toBe('0');
});
test('invalid credentials and draft policies are honestly labelled',async({page})=>{
 await page.goto('/');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill('incorrect-password');await page.getByRole('button',{name:'Sign in'}).click();await expect(page.getByRole('status')).toContainText('INVALID_CREDENTIALS');await page.getByRole('link',{name:'Privacy',exact:true}).click();await expect(page.getByText(/Draft disclosure only/)).toBeVisible();
});
