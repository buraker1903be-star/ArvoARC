import { login } from "./actions";

const messages: Record<string, string> = {
  "missing-fields": "E-posta ve şifre zorunludur.",
  "invalid-credentials": "E-posta veya şifre hatalı.",
  "no-organization": "Bu kullanıcıya bağlı aktif bir organizasyon bulunamadı.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}>
      <section className="card" style={{width:"min(440px,100%)",padding:32}}>
        <small>ARVO CULTURE · ADAPTIVE RETAIL CORE</small>
        <h1 style={{margin:"10px 0 6px"}}>ARVO ARC</h1>
        <p>ArvoOS hesabınızla devam edin.</p>
        {error && <p role="alert"><strong>{messages[error] ?? "Oturum açılamadı."}</strong></p>}
        <form action={login} style={{display:"grid",gap:12,marginTop:24}}>
          <label>E-posta<input name="email" type="email" autoComplete="email" required style={{display:"block",width:"100%",marginTop:6,padding:12}} /></label>
          <label>Şifre<input name="password" type="password" autoComplete="current-password" required style={{display:"block",width:"100%",marginTop:6,padding:12}} /></label>
          <button type="submit" style={{padding:12}}>Giriş yap</button>
        </form>
      </section>
    </main>
  );
}
