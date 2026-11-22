-- À exécuter UNE FOIS dans Supabase > SQL Editor, après t'être inscrit dans l'app
-- avec ton e-mail : te donne l'accès à la page Administration.
insert into public.platform_admins(user_id)
select id from auth.users where email = 'TON-EMAIL@exemple.com'
on conflict do nothing;
