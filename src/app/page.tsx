import Link from 'next/link';
export default function Home(){
 const features=[['Comandas','Pedidos por mesa, balcão e retirada.'],['Cardápio','Produtos, preços e categorias em um só lugar.'],['Estoque','Ingredientes e fichas técnicas para controlar custos.'],['Cozinha','Organização de pedidos e preparo.']];
 return <main style={{minHeight:'100vh',background:'linear-gradient(145deg,#f3faf5,#ffffff 55%,#fef5e9)',color:'#153328',fontFamily:'Arial,sans-serif'}}>
 <header style={{maxWidth:1080,margin:'auto',padding:'24px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:20}}>
 <Link href="/" style={{fontSize:25,fontWeight:800,color:'#153328',textDecoration:'none'}}>Meu<span style={{color:'#17884b'}}>Pedido</span></Link>
 <nav style={{display:'flex',gap:16,alignItems:'center'}}><Link href="/login" style={{color:'#153328'}}>Entrar</Link><Link href="/cadastro" style={{background:'#176d43',color:'#fff',padding:'12px 18px',borderRadius:12,textDecoration:'none',fontWeight:700}}>Criar conta</Link></nav></header>
 <section style={{maxWidth:1080,margin:'auto',padding:'90px 24px 75px'}}>
 <div style={{display:'inline-block',border:'1px solid #b8dcc6',background:'#e9f8ee',padding:'9px 15px',borderRadius:30,fontSize:13,fontWeight:700}}>Gestão para restaurantes e lanchonetes</div>
 <h1 style={{fontSize:'clamp(40px,6vw,72px)',maxWidth:780,lineHeight:1.08,letterSpacing:'-0.05em',margin:'25px 0'}}>Seu atendimento mais rápido. <span style={{color:'#17884b'}}>Sua operação no controle.</span></h1>
 <p style={{fontSize:20,lineHeight:1.65,maxWidth:640,color:'#51665b'}}>Um espaço para organizar cardápio, comandas, ingredientes e a rotina do seu estabelecimento.</p>
 <div style={{display:'flex',gap:14,flexWrap:'wrap',marginTop:32}}><Link href="/cadastro" style={{background:'#176d43',color:'white',padding:'16px 25px',borderRadius:12,textDecoration:'none',fontWeight:700}}>Começar agora →</Link><Link href="/login" style={{border:'1px solid #a8c8b6',padding:'16px 25px',borderRadius:12,textDecoration:'none',color:'#153328'}}>Já tenho conta</Link></div>
 <p style={{marginTop:20,color:'#69786f',fontSize:13}}>Em desenvolvimento: os módulos operacionais estão sendo implementados gradualmente.</p>
 </section>
 <section style={{maxWidth:1080,margin:'auto',padding:'0 24px 90px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:18}}>
 {features.map(([title,desc])=><article key={title} style={{background:'#fff',border:'1px solid #e3eee7',borderRadius:20,padding:25,boxShadow:'0 12px 28px #17452a0a'}}><div style={{width:38,height:38,background:'#e4f5e9',borderRadius:12,marginBottom:22}}/><h2 style={{fontSize:21}}>{title}</h2><p style={{lineHeight:1.55,color:'#607469'}}>{desc}</p></article>)}
 </section><footer style={{borderTop:'1px solid #e2eee5',padding:25,textAlign:'center',color:'#607469'}}>MeuPedido · Uma solução Kumo</footer></main>;
}
