# Bocatas

Web interna sencilla para pedir desayunos.

## 1. Supabase
En Supabase > SQL Editor, ejecuta `schema.sql`.

Después crea el primer usuario desde Supabase > Authentication > Users.
Luego inserta su perfil como admin en SQL:

update public.profiles set role='admin' where email='TU_EMAIL';

Si el perfil no existe, créalo con el UUID del usuario:
insert into public.profiles (id,name,email,role) values ('UUID','Tu nombre','TU_EMAIL','admin');

## 2. Configurar la web
Abre `app.js` y cambia:
SUPABASE_URL
SUPABASE_ANON_KEY

por los datos de Supabase > Project Settings > API.

## 3. Vercel
Sube el proyecto a GitHub y conéctalo a Vercel.

Añade estas variables de entorno en Vercel:
SUPABASE_URL = tu URL
SUPABASE_SERVICE_ROLE_KEY = tu Service Role Key

IMPORTANTE: la Service Role Key SOLO va en Vercel como variable de entorno. Nunca la pongas en app.js.

## 4. Uso
- Admin abre el pedido.
- Los usuarios eligen bocata y complementos.
- Admin ve todos los pedidos.
- Estadísticas se calculan automáticamente.
