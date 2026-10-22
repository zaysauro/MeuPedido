import type { ReactNode } from 'react';
import './globals.css';
import './marketing.css';
const url='https://meupedido.sistemakumo.com.br';
export const viewport={themeColor:'#123e2b'};
export const metadata={appleWebApp:{capable:true,title:'MeuPedido',statusBarStyle:'black-translucent'},icons:{apple:'/icons/icon-192.png'},metadataBase:new URL(url),title:{default:'MeuPedido | Seu restaurante organizado',template:'%s | MeuPedido · Kumo'},description:'Pedidos, mesas, cozinha, estoque, caixa e delivery em um só lugar. Conheça o MeuPedido, um produto Kumo.',openGraph:{title:'MeuPedido · Seu restaurante organizado',description:'Mais organização do primeiro pedido ao fechamento do caixa.',url,siteName:'MeuPedido · Kumo',locale:'pt_BR',type:'website'}};
export default function RootLayout({children}:{children:ReactNode}) {return <html lang="pt-BR"><body>{children}</body></html>}
