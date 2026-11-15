import assert from "node:assert/strict";
// Plan 4: iki gerçek PostgreSQL bağlantısı. İlk işlem kilidini tutarken ikinci işlem başlar; ikinci işlem
// eski belge/kural sürümüyle sessizce kabul edilmemeli ve kilit sırası deadlock üretmemelidir. 0018 sonrası çalışır.
export async function testPolicyRaces({ psql, asyncPsql, database }) {
  const id = n => `18100000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const head = "18000000-0000-0000-0000-000000000001";
  const [community, event, owner, a, b, c] = [1, 2, 3, 4, 5, 6].map(id);
  psql(`INSERT INTO auth.users(id) VALUES('${owner}'),('${a}'),('${b}'),('${c}');
    INSERT INTO communities(id,slug,name,status) VALUES('${community}','policy-races','Belge Yarışları','onaylandi');
    INSERT INTO community_members(community_id,user_id,github_login,role) VALUES('${community}','${owner}','owner','owner');
    INSERT INTO events(id,community_id,slug,title,starts_at,deadline) VALUES('${event}','${community}','policy-races','Belge Yarışları',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days');
    SELECT accept_management_policies('${owner}','owner','${community}',(SELECT array_agg(document_id) FROM policy_requirements WHERE kind<>'participant'));
    SELECT set_event_terms('${owner}','owner','${event}',null,'https://example.test/kural','https://example.test/aydinlatma',null);`, database);
  const value = async sql => (await asyncPsql(sql)).stdout.trim();
  const current = kind => `(SELECT document_id FROM policy_requirements WHERE kind='${kind}')`;
  const terms = `(SELECT current_terms_version_id FROM events WHERE id='${event}')`;
  const register = (user, repo, doc, termsId) => `SELECT id FROM register_project_with_terms('${event}','${user}','u',null,'Yarış Proje','Yarış Ekip','Belge yarışı test kaydı.',${repo},'race/p${repo}','https://github.com/race/p${repo}','main',null,null,'${doc}','${termsId}');`;
  const later = sql => new Promise(r => setTimeout(r, 150)).then(() => asyncPsql(sql));
  async function blocks(first, second, label, pattern) {
    const result = await Promise.allSettled([asyncPsql(`BEGIN; ${first} SELECT pg_sleep(0.6); COMMIT;`), later(second)]);
    assert.equal(result[0].status, "fulfilled", `${label}: ilk işlem başarısız: ${result[0].reason?.stderr}`);
    assert.equal(result[1].status, "rejected", `${label}: ikinci işlem reddedilmedi`);
    assert.ok(!/deadlock|statement timeout/i.test(result[1].reason.stderr), `${label}: kilit sırası yanlış: ${result[1].reason.stderr}`);
    if (pattern) assert.match(result[1].reason.stderr, pattern, label);
    console.log(`PASS: ${label}`);
  }

  // Form açıkken katılımcı belgesi yayınlanır: eski sürümle gelen kayıt yayını bekler ve reddedilir.
  const oldParticipant = await value(`SELECT ${current("participant")};`);
  const termsId = await value(`SELECT ${terms};`);
  const draft = await value(`SELECT create_policy_draft('${head}','head','participant','race-2',E'Yarış metni\\nkatılımcı');`);
  await blocks(`SELECT publish_policy_document('${head}','head','${draft}','${oldParticipant}','Yarış yayını');`,
    register(a, 181001, oldParticipant, termsId), "Belge yayını sürerken eski sürümle gelen kayıt reddedilir", /yeni sürümü/);
  assert.equal(await value(`SELECT count(*) FROM participant_enrollments WHERE user_id='${a}';`), "0");

  // Yönetim onayı ve yayın: eski platform sürümüyle gelen onay yayını bekler ve reddedilir.
  const managementDocs = await value(`SELECT array_agg(document_id)::text FROM policy_requirements WHERE kind<>'participant';`);
  const platformDraft = await value(`SELECT create_policy_draft('${head}','head','platform','race-2',E'Yarış metni\\nplatform');`);
  await blocks(`SELECT publish_policy_document('${head}','head','${platformDraft}',${current("platform")},'Yarış yayını');`,
    `SELECT accept_management_policies('${owner}','owner','${community}','${managementDocs}'::uuid[]);`,
    "Belge yayını sürerken eski sürümün yönetim onayı reddedilir", /yeni sürümü/);

  // Yönetim yazması sürerken yayın bekler; ardından aynı sahip yeniden onaysız yazamaz.
  await asyncPsql(`SELECT accept_management_policies('${owner}','owner','${community}',(SELECT array_agg(document_id) FROM policy_requirements WHERE kind<>'participant'));`);
  const platform3 = await value(`SELECT create_policy_draft('${head}','head','platform','race-3',E'Yarış metni\\nplatform 3');`);
  const writeThenPublish = await Promise.allSettled([
    asyncPsql(`BEGIN; SELECT admin_update_event('${event}','${owner}','owner','announce','{"announcement":"yarış"}'); SELECT pg_sleep(0.6); COMMIT;`),
    later(`SELECT publish_policy_document('${head}','head','${platform3}',${current("platform")},'Yarış yayını');`),
  ]);
  assert.ok(writeThenPublish.every(r => r.status === "fulfilled"), JSON.stringify(writeThenPublish.map(r => r.reason?.stderr)));
  await assert.rejects(asyncPsql(`SELECT admin_update_event('${event}','${owner}','owner','announce','{"announcement":"sonra"}');`), /ONAY/);
  console.log("PASS: Yönetim yazması sürerken yayın bekler; sonraki yazma yeniden onay ister (deadlock yok)");

  // Aynı kullanıcının eşzamanlı iki ilk kaydı: tek proje, tek enrollment.
  const participant = await value(`SELECT ${current("participant")};`);
  const doubles = await Promise.allSettled([asyncPsql(register(b, 181002, participant, termsId)), asyncPsql(register(b, 181003, participant, termsId))]);
  assert.equal(doubles.filter(r => r.status === "fulfilled").length, 1, "Eşzamanlı iki ilk kayıt iki proje üretti");
  assert.equal(await value(`SELECT count(*) FROM participant_enrollments WHERE user_id='${b}';`), "1");
  assert.equal(await value(`SELECT count(*) FROM event_terms_acceptances WHERE user_id='${b}';`), "1");
  console.log("PASS: Aynı kullanıcının eşzamanlı iki ilk kaydında tek proje ve tek enrollment oluşur");

  // İlk kayıt sürerken kural değişikliği: kayıt bitince kural artık değiştirilemez.
  await asyncPsql(`SELECT accept_management_policies('${owner}','owner','${community}',(SELECT array_agg(document_id) FROM policy_requirements WHERE kind<>'participant'));`);
  const event2 = id(7);
  psql(`INSERT INTO events(id,community_id,slug,title,starts_at,deadline) VALUES('${event2}','${community}','policy-races-2','Belge Yarışları 2',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days');
    SELECT set_event_terms('${owner}','owner','${event2}',null,'https://example.test/kural','https://example.test/aydinlatma',null);`, database);
  const terms2 = await value(`SELECT current_terms_version_id FROM events WHERE id='${event2}';`);
  const register2 = `SELECT id FROM register_project_with_terms('${event2}','${c}','u',null,'Yarış Proje','Yarış Ekip','Belge yarışı test kaydı.',181004,'race/p181004','https://github.com/race/p181004','main',null,null,'${participant}','${terms2}');`;
  await blocks(register2, `SELECT set_event_terms('${owner}','owner','${event2}','${terms2}','https://example.test/k2','https://example.test/a2',null);`,
    "İlk kayıt sürerken bekleyen kural değişikliği kayıttan sonra reddedilir", /ilk katılımcı/);
}
