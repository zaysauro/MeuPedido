export function parseBRL(value:string):number|null {
 const cleaned=value.trim();
 if(!/^\d{1,8}([,.]\d{1,2})?$/.test(cleaned))return null;
 const [whole,fraction='']=cleaned.replace(',','.').split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(cents)?cents:null;
}
export const money=(cents:number|string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents)/100);
