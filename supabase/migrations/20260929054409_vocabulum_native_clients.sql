begin;
set local lock_timeout='500ms';
set local statement_timeout='5s';
-- Add Vocabulum without changing existing public clients or web login.
alter table accounts.oauth_clients drop constraint oauth_clients_check;
alter table accounts.oauth_clients add constraint oauth_clients_check check
 ((client_kind='web' and callback_url ~ '^https://') or
  (client_kind='native' and ((app_id='app_kestrek' and callback_url='sk.kestrek://oauth/callback') or
   (app_id='app_mega_music' and callback_url='sk.developed.megamusic://oauth/callback') or
   (app_id='app_voc_builder' and callback_url='sk.developed.vocabulum://oauth/callback'))));
commit;
