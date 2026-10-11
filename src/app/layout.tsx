import type { ReactNode } from 'react';
export const metadata = { title: 'MeuPedido | Kumo', description: 'Gestão de pedidos para restaurantes e lanchonetes.' };
export default function RootLayout({children}:{children:ReactNode}) {return <html lang="pt-BR"><body style={{fontFamily:'system-ui, sans-serif',margin:0,background:'#f7f9f7',color:'#14281d'}}>{children}</body></html>}
