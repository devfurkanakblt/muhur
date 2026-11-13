import assert from "node:assert/strict";
// İki gerçek PostgreSQL bağlantısı: ilk işlem kilidini tutarken ikinci işlem başlatılır.
export async function testCommunityRaces({ psql, asyncPsql, database }) {
  const id=n=>`16000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
  const [community,event,owner,a,b,c,d]=[1,2,3,4,5,6,7].map(id);
  psql(`INSERT INTO auth.users(id) VALUES('${owner}'),('${a}'),('${b}'),('${c}'),('${d}');
    INSERT INTO communities(id,slug,name,status) VALUES('${community}','role-races','Rol Yarışları','onaylandi');
    INSERT INTO community_members(community_id,user_id,github_login,role) VALUES('${community}','${owner}','owner','owner');
    INSERT INTO events(id,community_id,slug,title,starts_at,deadline) VALUES('${event}','${community}','role-races','Rol Yarışları',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour');`,database);
  const invite=(hash,email)=>`SELECT create_role_invite('${owner}','owner','juri','${event}',repeat('${hash}',64),'${email}@example.test',repeat('x',32),gen_random_uuid());`;
  const accept=(user,hash)=>`SELECT accept_role_invite('${user}','user','github',repeat('${hash}',64));`;
  const register=(user,repo)=>`SELECT id FROM register_project('${event}','${user}','user',null,'Test Proje','Test Ekip','Rol yarisi test projesi.',${repo},'test/r${repo}','https://github.com/test/r${repo}','main',null,null);`;
  const later=sql=>new Promise(r=>setTimeout(r,150)).then(()=>asyncPsql(sql));
  async function blocks(first,second,label) {
    const result=await Promise.allSettled([asyncPsql(`BEGIN; ${first} SELECT pg_sleep(0.6); COMMIT;`),later(second)]);
    assert.equal(result[0].status,"fulfilled",`${label}: ilk işlem başarısız: ${result[0].reason?.stderr}`);
    assert.equal(result[1].status,"rejected",`${label}: ikinci işlem reddedilmedi`);
    assert.ok(!/deadlock|statement timeout/i.test(result[1].reason.stderr),`${label}: kilit sırası yanlış`);
    console.log(`PASS: ${label}`);
  }
  psql(invite('c','accept-first'),database);
  await blocks(accept(a,'c'),register(a,160001),'Jüri kabulü sürerken aynı etkinliğe yarışmacı kaydı reddedilir');
  psql(invite('d','register-first'),database);
  await blocks(register(b,160002),accept(b,'d'),'Yarışmacı kaydı sürerken jüri kabulü reddedilir');
  psql(invite('e','single-use'),database);
  await blocks(accept(c,'e'),accept(d,'e'),'İki kişi aynı daveti eşzamanlı tüketemez');
  psql(invite('f','revoke-first'),database);
  const revoke=`SELECT revoke_role_invite('${owner}','owner',(SELECT id FROM role_invites WHERE token_hash=repeat('f',64)));`;
  await blocks(revoke,accept(d,'f'),'Davet iptali sürerken bekleyen kabul geçersiz olur');
  psql(`SELECT create_role_invite('${owner}','owner','organizator','${community}',repeat('a',64),'org-race@example.test',repeat('x',32),gen_random_uuid());`,database);
  await blocks(accept(d,'a'),register(d,160003),'Organizatör kabulü sürerken topluluğun açık etkinliğine kayıt reddedilir');
  const head=id(8), application=id(9);
  psql(`INSERT INTO auth.users(id) VALUES('${head}'); INSERT INTO platform_roles(user_id,login,role) VALUES('${head}','head','head_admin');
    INSERT INTO communities(id,slug,name,status,applicant_id,contact_email) VALUES('${application}','review-race','Review Race','beklemede','${c}','test@example.test');`,database);
  await blocks(`SELECT review_community_application('${application}','${head}','head','onaylandi',null);`,
    `SELECT review_community_application('${application}','${head}','head','reddedildi','Reject reason');`,'Aynı başvurudaki eşzamanlı onay/ret yalnız tek karar ve sahip üretir');
  assert.equal((await asyncPsql(`SELECT count(*) FROM community_members WHERE community_id='${application}' AND role='owner';`)).stdout.trim(),'1');
  assert.equal((await asyncPsql(`SELECT count(*) FROM mail_outbox WHERE dedupe_key='review:${application}';`)).stdout.trim(),'1');
  // Webhook ve gönderim sonucu farklı bağlantılarda ters sırada gelir.
  psql(`INSERT INTO mail_outbox(dedupe_key,kind,community_id,recipient_email,payload) VALUES('race-mail','application_received','${community}','test@example.test','{}');`,database);
  const jobs=(await asyncPsql(`SELECT id||'|'||lease_token FROM claim_mail_jobs(10) WHERE dedupe_key='race-mail';`)).stdout.trim().split('|');
  assert.equal(jobs.length,2);
  const result=await Promise.allSettled([
    asyncPsql(`BEGIN; SELECT record_mail_event('race-delivered','race-message','delivered',clock_timestamp()); SELECT pg_sleep(0.6); COMMIT;`),
    later(`SELECT finish_mail_job('${jobs[0]}','${jobs[1]}','accepted','race-message');`)
  ]);
  assert.ok(result.every(r=>r.status==='fulfilled'),JSON.stringify(result));
  assert.equal((await asyncPsql(`SELECT delivery_state FROM mail_outbox WHERE id='${jobs[0]}';`)).stdout.trim(),'delivered');
  console.log('PASS: Webhook gönderim sonucundan önce gelince teslim bilgisi kaybolmaz');
}
