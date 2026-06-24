import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://gxvwpmwboynwhbjhloee.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q28F3Tgr-VpGChmIwM-4Yg_mis6nlZV";
const WAZEN_VERSION = "supabase-v2";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0, 10);
const money = (n) => `${Number(n || 0).toFixed(3)} د.ك`;
const cleanNumber = (v) => Number(v || 0);

let authUser = null;
let profile = null;
let state = {
  salary: null,
  incomes: [],
  expenses: [],
  goals: [],
  obligations: [],
  profiles: []
};

function toast(message){
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 2600);
}

async function checkSupabaseError(result, fallback = "حدث خطأ"){
  if(result.error){
    console.error(result.error);
    toast(result.error.message || fallback);
    return true;
  }
  return false;
}

async function init(){
  const { data } = await supabase.auth.getSession();
  if(data.session?.user){
    authUser = data.session.user;
    await loadProfile();
    await showApp();
  } else {
    $("loginView").classList.remove("hidden");
    $("appView").classList.add("hidden");
  }
}

async function loadProfile(){
  const res = await supabase.from("profiles").select("*").eq("id", authUser.id).single();
  if(res.error){
    console.error(res.error);
    profile = null;
    return;
  }
  profile = res.data;
}

async function login(email, password){
  const res = await supabase.auth.signInWithPassword({ email, password });
  if(await checkSupabaseError(res, "تعذر تسجيل الدخول")) return;

  authUser = res.data.user;
  await loadProfile();

  if(!profile){
    toast("الحساب موجود في Authentication لكنه غير مربوط بجدول profiles.");
    await supabase.auth.signOut();
    return;
  }

  if(profile.status !== "active"){
    toast("الحساب موقوف");
    await supabase.auth.signOut();
    return;
  }

  await showApp();
}

async function logout(){
  await supabase.auth.signOut();
  authUser = null;
  profile = null;
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
}

async function showApp(){
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("roleBadge").textContent = profile.role === "admin" ? "Admin" : "User";
  $("adminNavBtn").classList.toggle("hidden", profile.role !== "admin");
  await loadAll();
  switchView("homeView", false);
}

function pageTitle(view){
  return {
    homeView: "الرئيسية",
    incomeView: "الدخل والراتب",
    goalsView: "الأهداف",
    obligationsView: "الالتزامات",
    expensesView: "سجل المصروفات",
    adminView: "إدارة الحسابات"
  }[view] || "الرئيسية";
}

function switchView(view, shouldRender = true){
  if(view === "adminView" && profile.role !== "admin") return toast("هذه الصفحة للأدمن فقط");

  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $(view).classList.remove("hidden");

  document.querySelectorAll("[data-view]").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(`[data-view="${view}"]`).forEach(btn => btn.classList.add("active"));

  $("mobilePageTitle").textContent = pageTitle(view);
  if(shouldRender) renderAll();
  window.scrollTo({top:0, behavior:"smooth"});
}

async function loadAll(){
  const [salaryRes, incomesRes, expensesRes, goalsRes, obligationsRes] = await Promise.all([
    supabase.from("salaries").select("*").order("created_at", { ascending:false }).limit(1),
    supabase.from("incomes").select("*").order("income_date", { ascending:false }),
    supabase.from("expenses").select("*").order("expense_date", { ascending:false }),
    supabase.from("goals").select("*").neq("status", "done").order("due_date", { ascending:true }),
    supabase.from("obligations").select("*").neq("status", "inactive").order("due_day", { ascending:true })
  ]);

  if(await checkSupabaseError(salaryRes, "تعذر تحميل الراتب")) return;
  if(await checkSupabaseError(incomesRes, "تعذر تحميل الدخل")) return;
  if(await checkSupabaseError(expensesRes, "تعذر تحميل المصروفات")) return;
  if(await checkSupabaseError(goalsRes, "تعذر تحميل الأهداف")) return;
  if(await checkSupabaseError(obligationsRes, "تعذر تحميل الالتزامات")) return;

  state.salary = salaryRes.data?.[0] || null;
  state.incomes = incomesRes.data || [];
  state.expenses = expensesRes.data || [];
  state.goals = goalsRes.data || [];
  state.obligations = obligationsRes.data || [];

  if(profile.role === "admin"){
    const profilesRes = await supabase.from("profiles").select("*").order("created_at", { ascending:false });
    state.profiles = profilesRes.data || [];
  }
  renderAll();
}

function daysBetween(dateText){
  if(!dateText) return 0;
  const now = new Date();
  const target = new Date(dateText + "T00:00:00");
  const msDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.ceil((target - now) / msDay));
}

function isDateInCurrentCycle(dateText, nextSalaryDate){
  if(!dateText || !nextSalaryDate) return true;
  const d = new Date(dateText + "T00:00:00");
  const next = new Date(nextSalaryDate + "T00:00:00");
  const start = new Date(next);
  start.setMonth(start.getMonth() - 1);
  return d >= start && d <= next;
}

function calcSummary(){
  const salary = state.salary || { base_amount: 0, next_salary_date: todayISO(), note: "" };
  const nextSalaryDate = salary.next_salary_date || todayISO();
  const daysToSalary = daysBetween(nextSalaryDate);

  const extraIncomes = state.incomes.filter(i => isDateInCurrentCycle(i.income_date, nextSalaryDate));
  const cycleExpenses = state.expenses.filter(e => isDateInCurrentCycle(e.expense_date, nextSalaryDate));

  const baseSalary = cleanNumber(salary.base_amount);
  const extraIncomeTotal = extraIncomes.reduce((s, i) => s + cleanNumber(i.amount), 0);
  const totalIncome = baseSalary + extraIncomeTotal;
  const totalExpenses = cycleExpenses.reduce((s, e) => s + cleanNumber(e.amount), 0);
  const incomeRemaining = totalIncome - totalExpenses;

  const today = new Date();
  const currentDay = today.getDate();

  const upcomingObligations = state.obligations
    .filter(o => {
      if(o.type === "temporary" && o.end_date){
        const end = new Date(o.end_date + "T00:00:00");
        if(end < today) return false;
      }
      return cleanNumber(o.due_day) >= currentDay;
    })
    .reduce((s, o) => s + cleanNumber(o.amount), 0);

  const nearGoals = state.goals.filter(g => daysBetween(g.due_date) <= 60);
  const goalsRequiredNearTerm = nearGoals.reduce((sum, g) => {
    const need = Math.max(0, cleanNumber(g.target_amount) - cleanNumber(g.saved_amount));
    const gDays = Math.max(1, daysBetween(g.due_date));
    const cycleNeed = need / gDays * Math.max(1, daysToSalary);
    return sum + Math.min(need, cycleNeed);
  }, 0);

  const realAvailable = incomeRemaining - upcomingObligations - goalsRequiredNearTerm;
  const dailySafe = daysToSalary > 0 ? realAvailable / daysToSalary : realAvailable;

  const categories = {};
  cycleExpenses.forEach(e => {
    categories[e.category] = (categories[e.category] || 0) + cleanNumber(e.amount);
  });

  const topCategories = Object.entries(categories).sort((a,b) => b[1] - a[1]).slice(0, 5);

  const nearestGoal = state.goals
    .map(g => ({...g, days_left: daysBetween(g.due_date)}))
    .sort((a,b) => a.days_left - b.days_left)[0];

  const todayExpenseTotal = state.expenses
    .filter(e => e.expense_date === todayISO())
    .reduce((s,e) => s + cleanNumber(e.amount), 0);

  return { salary, baseSalary, nextSalaryDate, daysToSalary, extraIncomeTotal, totalIncome, totalExpenses, incomeRemaining, upcomingObligations, nearGoals, goalsRequiredNearTerm, realAvailable, dailySafe, topCategories, nearestGoal, todayExpenseTotal };
}

function renderHome(){
  const s = calcSummary();

  $("nextPayChip").textContent = `الراتب القادم: ${s.nextSalaryDate || "—"}`;
  $("realAvailable").textContent = money(s.realAvailable);
  $("incomeRemaining").textContent = money(s.incomeRemaining);
  $("dailySafeAmount").textContent = money(s.dailySafe);
  $("nearGoalsCount").textContent = s.nearGoals.length;
  $("nearestGoalText").textContent = s.nearestGoal ? `أقرب هدف: ${s.nearestGoal.name}.` : "لا توجد أهداف قريبة.";
  $("extraIncomeTotal").textContent = money(s.extraIncomeTotal);
  $("continuousCount").textContent = state.obligations.filter(o => o.type === "continuous").length;
  $("temporaryCount").textContent = state.obligations.filter(o => o.type === "temporary").length;
  $("todayExpenseTotal").textContent = money(s.todayExpenseTotal);

  const status = $("statusBadge");
  status.className = "status";
  if(!s.baseSalary){
    status.innerHTML = `<span class="dot"></span> بانتظار البيانات`;
    $("statusText").textContent = "أدخل الراتب وتاريخ الراتب القادم حتى تظهر المؤشرات بدقة.";
    $("realAvailableText").textContent = "أدخل بيانات الدخل أولًا.";
  } else if(s.realAvailable < 0){
    status.classList.add("bad");
    status.innerHTML = `<span class="dot"></span> ضغط مالي`;
    $("statusText").textContent = "المتاح الحقيقي بالسالب بعد خصم الالتزامات والأهداف القريبة.";
    $("realAvailableText").textContent = "تنبيه: المتاح الحقيقي أقل من صفر.";
  } else if(s.dailySafe < 5){
    status.innerHTML = `<span class="dot"></span> يحتاج متابعة`;
    $("statusText").textContent = "المبلغ اليومي المناسب منخفض. الأفضل مراقبة المصروفات اليومية.";
    $("realAvailableText").textContent = "متاح، لكنه يحتاج متابعة يومية.";
  } else {
    status.classList.add("good");
    status.innerHTML = `<span class="dot"></span> مستقر`;
    $("statusText").textContent = "الوضع مقبول حسب البيانات المدخلة.";
    $("realAvailableText").textContent = "بعد خصم الالتزامات القريبة واحتياج الأهداف.";
  }

  $("topCategoriesList").innerHTML = s.topCategories.length
    ? s.topCategories.map(([cat, amount]) => `<div class="item"><div><b>${cat}</b><small>مصروفات متغيرة</small></div><div class="amount">${money(amount)}</div></div>`).join("")
    : `<div class="muted">لا توجد مصروفات في الدورة الحالية.</div>`;
}

function renderIncome(){
  const s = calcSummary();
  $("baseSalaryAmount").value = state.salary?.base_amount || "";
  $("nextSalaryDate").value = state.salary?.next_salary_date || todayISO();
  $("salaryNote").value = state.salary?.note || "";
  $("incomeDate").value ||= todayISO();

  $("incomeList").innerHTML = state.incomes.length
    ? state.incomes.map(i => `<div class="item"><div><b>${i.source}</b><small>${i.income_date} — ${i.recurring ? "متكرر" : "غير متكرر"}</small></div><div class="amount">${money(i.amount)}</div><div class="item-actions"><button class="danger-btn" data-delete-table="incomes" data-delete-id="${i.id}">حذف</button></div></div>`).join("")
    : `<div class="muted">لا يوجد دخل إضافي مسجل.</div>`;
}

function priorityLabel(priority){ return priority === "high" ? "عالية" : priority === "medium" ? "متوسطة" : "منخفضة"; }

function renderGoals(){
  $("goalsList").innerHTML = state.goals.length
    ? state.goals.map(g => {
      const target = Math.max(1, cleanNumber(g.target_amount));
      const saved = cleanNumber(g.saved_amount);
      const pct = Math.min(100, saved / target * 100);
      const need = Math.max(0, cleanNumber(g.target_amount) - saved);
      return `<div class="goal-card"><span class="priority ${g.priority}">${priorityLabel(g.priority)}</span><h3>${g.name}</h3><p class="muted">تاريخ الهدف: ${g.due_date} — باقي ${daysBetween(g.due_date)} يوم</p><div class="progress"><span style="width:${pct}%"></span></div><p>المطلوب: <b>${money(g.target_amount)}</b><br>المتوفر: <b>${money(g.saved_amount)}</b><br>المتبقي: <b>${money(need)}</b></p><div class="item-actions"><button class="ghost-btn" data-goal-saving="${g.id}">إضافة مبلغ</button><button class="danger-btn" data-delete-table="goals" data-delete-id="${g.id}">حذف</button></div></div>`;
    }).join("")
    : `<div class="muted">لا توجد أهداف نشطة.</div>`;
}

function renderObligations(){
  $("obligationStartDate").value ||= todayISO();
  $("obligationsList").innerHTML = state.obligations.length
    ? state.obligations.map(o => `<div class="item"><div><b>${o.name}</b><small>${o.type === "continuous" ? "التزام مستمر" : "التزام مؤقت"} — يوم الاستحقاق ${o.due_day}${o.end_date ? " — ينتهي " + o.end_date : ""}</small></div><div class="amount">${money(o.amount)}</div><div class="item-actions"><button class="danger-btn" data-delete-table="obligations" data-delete-id="${o.id}">حذف</button></div></div>`).join("")
    : `<div class="muted">لا توجد التزامات مسجلة.</div>`;
}

function renderExpenses(){
  $("expenseDate").value ||= todayISO();
  $("expensesList").innerHTML = state.expenses.length
    ? state.expenses.map(e => `<div class="item"><div><b>${e.category}</b><small>${e.expense_date}${e.note ? " — " + e.note : ""}</small></div><div class="amount">${money(e.amount)}</div><div class="item-actions"><button class="danger-btn" data-delete-table="expenses" data-delete-id="${e.id}">حذف</button></div></div>`).join("")
    : `<div class="muted">لا توجد مصروفات مسجلة.</div>`;
}

function renderAdmin(){
  if(profile.role !== "admin") return;
  $("usersList").innerHTML = state.profiles.length
    ? state.profiles.map(p => `<div class="item"><div><b>${p.full_name}</b><small>${p.role === "admin" ? "أدمن" : "مستخدم"} — ${p.status}</small></div></div>`).join("")
    : `<div class="muted">لا توجد ملفات مستخدمين ظاهرة.</div>`;
}

function renderAll(){
  renderHome();
  renderIncome();
  renderGoals();
  renderObligations();
  renderExpenses();
  renderAdmin();
}

async function addExpense(amount, category, note = "", method = "quick", date = todayISO()){
  amount = cleanNumber(amount);
  if(!amount || amount <= 0) return toast("أدخل مبلغًا صحيحًا");
  const res = await supabase.from("expenses").insert({ user_id: authUser.id, amount, category, note, expense_date: date, entry_method: method });
  if(await checkSupabaseError(res, "تعذر حفظ المصروف")) return;
  await loadAll();
  toast("تم تسجيل المصروف");
}

async function deleteItem(table, id){
  const res = await supabase.from(table).delete().eq("id", id);
  if(await checkSupabaseError(res, "تعذر الحذف")) return;
  await loadAll();
  toast("تم الحذف");
}

async function addGoalSaving(id){
  const value = cleanNumber(prompt("كم تريد إضافة مبلغ لهذا الهدف؟"));
  if(!value || value <= 0) return;
  const goal = state.goals.find(g => g.id === id);
  const res = await supabase.from("goals").update({ saved_amount: cleanNumber(goal.saved_amount) + value }).eq("id", id);
  if(await checkSupabaseError(res, "تعذر تحديث الهدف")) return;
  await loadAll();
  toast("تم تحديث الهدف");
}

async function saveSalary(){
  const payload = {
    base_amount: cleanNumber($("baseSalaryAmount").value),
    next_salary_date: $("nextSalaryDate").value || todayISO(),
    note: $("salaryNote").value.trim()
  };
  let res;
  if(state.salary?.id){
    res = await supabase.from("salaries").update(payload).eq("id", state.salary.id);
  } else {
    res = await supabase.from("salaries").insert({ ...payload, user_id: authUser.id });
  }
  if(await checkSupabaseError(res, "تعذر حفظ الراتب")) return;
  await loadAll();
  toast("تم حفظ الراتب");
}

async function addIncome(){
  const amount = cleanNumber($("incomeAmount").value);
  const source = $("incomeSource").value.trim();
  if(!amount || amount <= 0) return toast("أدخل مبلغ الدخل");
  if(!source) return toast("أدخل مصدر الدخل");
  const res = await supabase.from("incomes").insert({
    user_id: authUser.id,
    amount,
    source,
    income_date: $("incomeDate").value || todayISO(),
    recurring: $("incomeRecurring").value === "true"
  });
  if(await checkSupabaseError(res, "تعذر إضافة الدخل")) return;
  $("incomeAmount").value = "";
  $("incomeSource").value = "";
  await loadAll();
  toast("تمت إضافة الدخل");
}

async function addGoal(){
  const name = $("goalName").value.trim();
  const target = cleanNumber($("goalTargetAmount").value);
  const due = $("goalDueDate").value;
  if(!name) return toast("أدخل اسم الهدف");
  if(!target || target <= 0) return toast("أدخل مبلغ الهدف");
  if(!due) return toast("أدخل تاريخ الهدف");
  const res = await supabase.from("goals").insert({
    user_id: authUser.id,
    name,
    target_amount: target,
    saved_amount: cleanNumber($("goalSavedAmount").value),
    due_date: due,
    priority: $("goalPriority").value,
    status: "active"
  });
  if(await checkSupabaseError(res, "تعذر حفظ الهدف")) return;
  $("goalName").value = "";
  $("goalTargetAmount").value = "";
  $("goalSavedAmount").value = "0";
  $("goalDueDate").value = "";
  await loadAll();
  toast("تم حفظ الهدف");
}

async function addObligation(){
  const name = $("obligationName").value.trim();
  const amount = cleanNumber($("obligationAmount").value);
  const dueDay = cleanNumber($("obligationDueDay").value);
  if(!name) return toast("أدخل اسم الالتزام");
  if(!amount || amount <= 0) return toast("أدخل مبلغ الالتزام");
  if(!dueDay || dueDay < 1 || dueDay > 31) return toast("أدخل يوم استحقاق صحيح");
  const res = await supabase.from("obligations").insert({
    user_id: authUser.id,
    name,
    amount,
    type: $("obligationType").value,
    due_day: dueDay,
    start_date: $("obligationStartDate").value || todayISO(),
    end_date: $("obligationEndDate").value || null,
    status: "active"
  });
  if(await checkSupabaseError(res, "تعذر حفظ الالتزام")) return;
  $("obligationName").value = "";
  $("obligationAmount").value = "";
  $("obligationDueDay").value = "";
  $("obligationEndDate").value = "";
  await loadAll();
  toast("تم حفظ الالتزام");
}

function localAI(questionType, customQuestion = ""){
  const s = calcSummary();
  const lines = [];
  lines.push("تحليل وازن بناءً على البيانات المدخلة فقط:");
  lines.push("");
  if(!s.baseSalary) lines.push("البيانات الناقصة: الراتب الأساسي.");
  lines.push(`الدخل الكلي في الدورة الحالية: ${money(s.totalIncome)}.`);
  lines.push(`إجمالي المصروفات المسجلة: ${money(s.totalExpenses)}.`);
  lines.push(`المتبقي من الدخل: ${money(s.incomeRemaining)}.`);
  lines.push(`المتاح الحقيقي للصرف: ${money(s.realAvailable)}.`);
  lines.push(`المبلغ المناسب يوميًا حتى الراتب القادم: ${money(s.dailySafe)}.`);
  lines.push("");

  if(questionType === "today"){
    lines.push(s.dailySafe <= 0 ? "اليوم لا يوجد مجال آمن للصرف حسب البيانات الحالية." : `تستطيع الصرف اليوم بشرط أن يكون قريبًا من ${money(s.dailySafe)} أو أقل.`);
  } else if(questionType === "pressure"){
    const pressures = [];
    if(s.upcomingObligations > 0) pressures.push(`الالتزامات القريبة: ${money(s.upcomingObligations)}`);
    if(s.goalsRequiredNearTerm > 0) pressures.push(`احتياج الأهداف القريبة: ${money(s.goalsRequiredNearTerm)}`);
    if(s.topCategories[0]) pressures.push(`أعلى بند صرف: ${s.topCategories[0][0]} بقيمة ${money(s.topCategories[0][1])}`);
    lines.push(pressures.length ? `أكثر عناصر الضغط الحالية:\n- ${pressures.join("\n- ")}` : "لا توجد عناصر ضغط واضحة لأن البيانات قليلة.");
  } else if(questionType === "reduce"){
    lines.push(s.topCategories[0] ? `ابدأ بتخفيف بند ${s.topCategories[0][0]} لأنه أعلى بند صرف مسجل.` : "لا توجد مصروفات كافية لتحديد بند يمكن تخفيفه.");
  } else {
    lines.push(s.realAvailable < 0 ? "الحالة: ضغط مالي." : s.dailySafe < 5 ? "الحالة: تحتاج متابعة." : "الحالة: مستقرة مبدئيًا.");
  }

  if(s.nearestGoal){
    const need = Math.max(0, cleanNumber(s.nearestGoal.target_amount) - cleanNumber(s.nearestGoal.saved_amount));
    lines.push("");
    lines.push(`أقرب هدف: ${s.nearestGoal.name}، والمتبقي له ${money(need)}.`);
  }

  if(customQuestion){
    lines.push("");
    lines.push(`سؤالك: ${customQuestion}`);
  }

  lines.push("");
  lines.push("ملاحظة: هذا تحليل تنظيمي للمصروفات وليس نصيحة استثمارية أو ائتمانية.");
  return lines.join("\n");
}

async function runAI(questionType = "summary"){
  const answer = localAI(questionType, $("customAiQuestion").value.trim());
  $("aiAnswer").textContent = answer;
  await supabase.from("ai_reports").insert({
    user_id: authUser.id,
    input_summary: { questionType },
    ai_output: answer
  });
}

async function createUserFromAdmin(){
  if(profile.role !== "admin") return toast("هذه الصلاحية للأدمن فقط");
  toast("إضافة المستخدمين تحتاج Edge Function. سنفعلها في الخطوة التالية.");
}

document.addEventListener("DOMContentLoaded", () => {
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await login($("loginEmail").value.trim(), $("loginPassword").value);
  });

  $("logoutBtn").addEventListener("click", logout);
  $("mobileLogoutBtn").addEventListener("click", logout);

  document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  $("saveSalaryBtn").addEventListener("click", saveSalary);
  $("addIncomeBtn").addEventListener("click", addIncome);

  $("addQuickExpenseBtn").addEventListener("click", async () => {
    await addExpense($("quickExpenseAmount").value, $("quickExpenseCategory").value, $("quickExpenseNote").value.trim(), "quick");
    $("quickExpenseAmount").value = "";
    $("quickExpenseNote").value = "";
  });

  document.querySelectorAll("[data-template-category]").forEach(btn => {
    btn.addEventListener("click", () => addExpense(btn.dataset.templateAmount, btn.dataset.templateCategory, "قالب سريع", "template"));
  });

  $("addExpenseBtn").addEventListener("click", async () => {
    await addExpense($("expenseAmount").value, $("expenseCategory").value, $("expenseNote").value.trim(), "detailed", $("expenseDate").value || todayISO());
    $("expenseAmount").value = "";
    $("expenseNote").value = "";
  });

  $("addGoalBtn").addEventListener("click", addGoal);
  $("addObligationBtn").addEventListener("click", addObligation);
  $("addUserBtn").addEventListener("click", createUserFromAdmin);

  document.querySelectorAll("[data-ai-question]").forEach(btn => btn.addEventListener("click", () => runAI(btn.dataset.aiQuestion)));
  $("askAiBtn").addEventListener("click", () => runAI("custom"));

  document.body.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-delete-table]");
    if(del) await deleteItem(del.dataset.deleteTable, del.dataset.deleteId);

    const saving = e.target.closest("[data-goal-saving]");
    if(saving) await addGoalSaving(saving.dataset.goalSaving);
  });

  init();
});
