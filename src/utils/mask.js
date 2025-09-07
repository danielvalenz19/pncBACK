function maskName(name){ if(!name) return null; if(name.length<=2) return name[0]+'*'; return name[0]+'***'+name[name.length-1]; }
function maskEmail(email){ if(!email) return null; const [u,d]=email.split('@'); if(!d) return email[0]+'***'; const uMask=u.length<=2?u[0]+'*':u[0]+'***'+u[u.length-1]; return `${uMask}@${d}`; }
function last4(phone){ if(!phone) return null; const digits=String(phone).replace(/\D/g,''); return digits.slice(-4)||null; }
function maskCitizen({ name, email, phone }){ return { name: maskName(name), email: maskEmail(email), phone_last4: last4(phone) }; }
module.exports = { maskCitizen };