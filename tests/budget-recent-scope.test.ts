import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../app/budget/page.tsx',import.meta.url),'utf8');
test('recent record heading explains all-period transaction-date ordering',()=>{
 assert.ok(source.includes('>전체 기간 최근 기록</p>'));
 assert.ok(source.includes('>조회한 월과 관계없이, 거래 날짜가 최근인 순서예요.</h2>'));
});
test('recent records retain cross-month date order and five/all toggle independently of selected month',()=>{
 const start=source.indexOf('  const recentThreshold = 5');
 const end=source.indexOf('  const shouldShowAppSplash',start);
 assert.ok(start>=0&&end>start);
 const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const transactions=Array.from({length:6},(_,i)=>({id:String(i),date:`2026-10-0${i+1}`,amount:1}));
 for(const selectedMonth of ['2026-09','2026-10'])for(const showAllRecent of [false,true]){
  const result=vm.runInNewContext(code+';visibleRecent.map(item=>item.date)',{transactions,incomeList:[{date:'2026-09-30',amount:1}],savings:[],selectedMonth,showAllRecent});
  assert.deepEqual(Array.from(result),showAllRecent?['2026-10-06','2026-10-05','2026-10-04','2026-10-03','2026-10-02','2026-10-01','2026-09-30']:['2026-10-06','2026-10-05','2026-10-04','2026-10-03','2026-10-02']);
 }
});

test('actual page expense totals exclude prepaid transfers while retaining all transaction rows and prepaid balance',()=>{
 const start=source.indexOf('    const selectedTransactions =');const end=source.indexOf('    const telecomTotal =',start);assert.ok(start>=0&&end>start);
 const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const transactions=[
  {id:'topup',date:'2026-11-18',amount:50000,transaction_type:'충전카드 충전',payment:'충전카드',category:'기타'},
  {id:'use',date:'2026-11-18',amount:9000,transaction_type:'충전카드 사용',payment:'충전카드',category:'식비'},
  {id:'cash',date:'2026-11-18',amount:3000,transaction_type:'일반 지출',payment:'현금',category:'카페'},
  {id:'check',date:'2026-11-18',amount:4000,transaction_type:'일반 지출',payment:'체크카드',category:'생활용품'},
  {id:'mobile',date:'2026-11-18',amount:900,transaction_type:'휴대폰 소액결제',payment:'휴대폰 소액결제',category:'구독'},
 ];const original=structuredClone(transactions);
 const r=vm.runInNewContext(code+';({total,actualExpenseTotal,prepaidTopupTotal,prepaidSpendTotal,estimatedPrepaidBalance,mobileMicroTotal,count:selectedTransactions.length})',{transactions,incomeList:[],savings:[],currentYear:2026,currentMonth:10,isInMonth:(date:string,year:number,month:number)=>date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)});
 assert.equal(r.total,16900);assert.equal(r.actualExpenseTotal,16900);assert.equal(r.prepaidTopupTotal,50000);assert.equal(r.prepaidSpendTotal,9000);assert.equal(r.estimatedPrepaidBalance,41000);assert.equal(r.mobileMicroTotal,900);assert.equal(r.count,5);assert.deepEqual(transactions,original);
});

test('page category payment month comparison and AI summaries use the same expense-only rows',()=>{
 const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const declarations=(name:string)=>{const hits:string[]=[];const walk=(n:ts.Node)=>{if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text===name)hits.push('const '+n.getText(tree)+';');ts.forEachChild(n,walk)};walk(tree);assert.ok(hits.length,name);return hits;};
 const property=(name:string)=>{const hits:string[]=[];const walk=(n:ts.Node)=>{if(ts.isPropertyAssignment(n)&&n.name.getText(tree)===name)hits.push(n.initializer.getText(tree));ts.forEachChild(n,walk)};walk(tree);assert.equal(hits.length,1,name);return hits[0];};
 const transactions=[
  {id:'topup',date:'2026-11-18',amount:50000,transaction_type:'충전카드 충전',payment:'충전카드',category:'기타'},
  {id:'use',date:'2026-11-18',amount:9000,transaction_type:'충전카드 사용',payment:'충전카드',category:'식비'},
  {id:'bank',date:'2026-11-18',amount:6000,transaction_type:'일반 지출',payment:'계좌이체',category:'식비'},
  {id:'previous-topup',date:'2026-10-18',amount:70000,transaction_type:'충전카드 충전',payment:'충전카드',category:'기타'},
  {id:'previous-use',date:'2026-10-18',amount:7000,transaction_type:'충전카드 사용',payment:'충전카드',category:'식비'},
 ];
 const names=['selectedTransactions','selectedIncomeList','selectedSavings','isExpenseTransaction','expenseTransactions','selectedExpenseTransactions','allExpenseTotal','total','incomeTotal','savingsRecordedTotal','paymentStats','previousMonthExpenses','topCategoryEntry','topCategoryName','topCategoryAmount','recurringSourceTransactions'];
 const code=names.map(name=>declarations(name)[0]).join('\n')+`;({total,allExpenseTotal,previousMonthExpenses,topCategoryName,topCategoryAmount,paymentStats,rawCount:selectedTransactions.length,expenseCount:selectedExpenseTransactions.length,recurringCount:recurringSourceTransactions.length,categorySummary:(${property('categorySummary')}),paymentSummary:(${property('paymentSummary')}),transactionTypeSummary:(${property('transactionTypeSummary')}),previousCategorySummary:(${property('previousCategorySummary')})})`;
 const r=vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{transactions,incomeList:[{date:'2026-11-18',amount:100000}],savings:[{date:'2026-11-18',amount:20000}],recurringTransactions:transactions,currentYear:2026,currentMonth:10,previousYear:2026,previousMonth:9,isInMonth:(date:string,year:number,month:number)=>date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)});
 assert.equal(r.total,15000);assert.equal(r.allExpenseTotal,22000);assert.equal(r.previousMonthExpenses,7000);assert.equal(r.topCategoryName,'식비');assert.equal(r.topCategoryAmount,15000);assert.equal(r.rawCount,3);assert.equal(r.expenseCount,2);assert.equal(r.recurringCount,3);
 assert.deepEqual(JSON.parse(JSON.stringify(r.categorySummary)),{식비:15000});assert.deepEqual(JSON.parse(JSON.stringify(r.previousCategorySummary)),{식비:7000});assert.deepEqual(JSON.parse(JSON.stringify(r.paymentStats)),{충전카드:9000,계좌이체:6000});assert.deepEqual(JSON.parse(JSON.stringify(r.paymentSummary)),{충전카드:9000,계좌이체:6000});assert.equal(r.transactionTypeSummary['충전카드 충전'],50000);assert.equal(r.transactionTypeSummary['충전카드 사용'],9000);
 for(const block of declarations('catTotals'))assert.match(block,/selectedExpenseTransactions/);
 assert.match(source,/transactions=\{transactions\}/);assert.match(source,/const prepaidTopupTotal = selectedTransactions/);assert.match(source,/const prepaidSpendTotal = selectedTransactions/);
 assert.match(source,/selectedExpenseTransactions.length > 0 \? Math.round\(total \/ selectedExpenseTransactions.length\)/);
 assert.match(source,/const remainingMoney = budgetConfigured \? budget - total : 0/);
 assert.match(source,/totalExpense: total/);
});
