-- Solo datos sintéticos. Teléfonos NANP del rango ficticio 202-555-01xx.
-- Aditivo e idempotente: no borra ni sobrescribe clientes existentes.
begin;
insert into public.clients(id,client_number,display_name,status,notes) values
 ('10000000-0000-4000-8000-000000000012',12,'Carolina Pérez','active','Cliente sintético para demostración. Teléfono ficticio.'),
 ('10000000-0000-4000-8000-000000000013',13,'Juan Soto','active','Cliente sintético para demostración. Teléfono ficticio.')
on conflict(id) do nothing;
select setval('public.clients_client_number_seq', greatest((select last_value from public.clients_client_number_seq),(select max(client_number) from public.clients)),true);
insert into public.client_identities(id,client_id,kind,value_raw,value_normalized,verification_source) values
 ('20000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000012','email','carolina@example.test','carolina@example.test','manual'),
 ('20000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000012','phone','+1 202 555 0112','+12025550112','manual'),
 ('20000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000013','email','juan@example.test','juan@example.test','manual'),
 ('20000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000013','phone','+1 202 555 0113','+12025550113','manual')
on conflict(id) do nothing;
commit;
