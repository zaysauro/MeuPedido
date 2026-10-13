import type { ReactNode } from 'react';
import './globals.css';
const url='https://meupedido.sistemakumo.com.br';
export const metadata={metadataBase:new URL(url),title:{default:'MeuPedido | Seu restaurante organizado',template:'%s | MeuPedido · Kumo'},description:'Pedidos, mesas, cozinha, estoque, caixa e delivery em um só lugar. Conheça o MeuPedido, um produto Kumo.',openGraph:{title:'MeuPedido · Seu restaurante organizado',description:'Mais organização do primeiro pedido ao fechamento do caixa.',url,siteName:'MeuPedido · Kumo',locale:'pt_BR',type:'website'}};
export default function RootLayout({children}:{children:ReactNode}) {return <html lang="pt-BR"><body>{children}</body></html>}
