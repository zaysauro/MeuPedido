import type {MetadataRoute} from 'next';

export default function manifest():MetadataRoute.Manifest {
  return {
    id:'/',name:'MeuPedido · Operação',short_name:'MeuPedido',
    description:'Pedidos, mesas e cozinha conectados no seu estabelecimento.',
    lang:'pt-BR',start_url:'/painel',scope:'/',display:'standalone',
    background_color:'#081a13',theme_color:'#123e2b',
    icons:[
      {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'/icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
    ],
  };
}
