export type Permission = 'serve'|'prepare'|'deliver'|'cash'|'reports'|'manage'|'staff';
export function hasPermission(role:string, permission:Permission, grants:string[]=[]):boolean {
 if(role==='owner')return true;
 if(permission==='staff')return false;
 if(role==='admin')return true; // preserved legacy administrator
 if(role==='manager')return ['serve','prepare','deliver','cash'].includes(permission)||grants.includes(permission);
 if(role==='cashier')return ['serve','deliver','cash'].includes(permission);
 if(role==='waiter'||role==='staff')return ['serve','deliver'].includes(permission);
 return role==='kitchen'&&permission==='prepare';
}
export function routePermission(path:string,method:string,resource:string|null,status?:unknown):Permission|null {
 const read=method==='GET';
 if(path==='/api/restaurant/kitchen')return read?'prepare':status==='entregue'?'deliver':'prepare';
 if(path==='/api/restaurant')return read?(['tables','customers','categories','orders'].includes(resource||'')?'serve':'manage'):'manage';
 if(['/api/restaurant/reports','/api/restaurant/dashboard'].includes(path))return 'reports';
 if(['/api/restaurant/cash','/api/restaurant/payments'].includes(path))return 'cash';
 if(path==='/api/restaurant/orders'&&method==='PATCH')return 'cash';
 if(path==='/api/restaurant/order-items'&&['PATCH','DELETE'].includes(method))return 'manage';
 if(['/api/restaurant/cancel','/api/restaurant/inventory','/api/restaurant/recipes','/api/restaurant/consume'].includes(path))return 'manage';
 if(path==='/api/menu/manage'||path==='/api/menu/create')return 'manage';
 if(path==='/api/restaurant/addons')return read?'serve':'manage';
 if(['/api/menu','/api/restaurant/checkout','/api/restaurant/orders','/api/restaurant/order-items','/api/restaurant/order-detail','/api/restaurant/tables','/api/restaurant/transfer','/api/restaurant/addresses','/api/restaurant/customers','/api/restaurant/delivery'].includes(path))return 'serve';
 return null; // unknown routes fail closed
}
export function canVisit(role:string,path:string,grants:string[]=[]){
 if(['/suporte','/notificacoes'].includes(path))return true;
 if(['/configuracoes','/assinatura','/funcionarios'].includes(path))return role==='owner';
 if(path.startsWith('/cozinha'))return hasPermission(role,'prepare',grants)||hasPermission(role,'serve',grants);
 if(['/painel','/relatorios'].includes(path))return hasPermission(role,'reports',grants);
 if(path==='/caixa')return hasPermission(role,'cash',grants);
 if(['/estoque','/fichas-tecnicas','/cardapio/gerenciar','/operacao'].includes(path))return hasPermission(role,'manage',grants);
 return hasPermission(role,'serve',grants);
}
