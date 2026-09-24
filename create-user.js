const { createClient } = require("@supabase/supabase-js");
module.exports = async (req,res)=>{
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  try{
    const auth=req.headers.authorization||"";
    const token=auth.replace("Bearer ","");
    const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const {data:{user},error:ue}=await admin.auth.getUser(token);
    if(ue||!user)return res.status(401).json({error:"No autorizado"});
    const {data:profile}=await admin.from("profiles").select("role").eq("id",user.id).single();
    if(profile?.role!=="admin")return res.status(403).json({error:"Solo el administrador puede crear usuarios"});
    const {name,email,password}=req.body||{};
    if(!name||!email||!password)return res.status(400).json({error:"Faltan datos"});
    const {data:newUser,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});
    if(error)return res.status(400).json({error:error.message});
    const {error:pe}=await admin.from("profiles").insert({id:newUser.user.id,name,email,role:"user"});
    if(pe){await admin.auth.admin.deleteUser(newUser.user.id);return res.status(400).json({error:pe.message})}
    res.status(200).json({ok:true});
  }catch(e){res.status(500).json({error:e.message})}
};
