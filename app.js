const LS_KEY = "wazen_app_v1";
const SESSION_KEY = "wazen_session_v1";

const $ = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
const money = (n) => `${Number(n || 0).toFixed(3)} د.ك`;
const cleanNumber = (v) => Number(v || 0);

let db = loadDB();
let session = loadSession();

function seedDB(){
  return {
    users: [
      { id: "admin-1", name: "الأدمن", email: "admin@example.com", password: "123456", role: "admin", status: "active", created_at: todayISO() },
      { id: "user-1", name: "مستخدم تجريبي", email: "user@example.com", password: "123456", role: "user", status: "active", created_at: todayISO() }
    ],
    salaries: {
      "admin-1": { base_amount: 2454, next_salary_date: "2026-06-28", note: "راتب أساسي" },
      "user-1": { base_amount: 900, next_salary_date: "2026-06-28", note: "راتب أساسي" }
    },
    incomes: [
      { id: uid(), user_id: "admin-1", amount: 150, source: "دخل إضافي تجريبي", date: todayISO(), recurring: "no" }
    ],
    expenses: [
      { id: uid(), user_id: "admin-1", amount: 1.250, category: "قهوة", note: "قالب تجريبي", date: todayISO(), entry_method: "quick" },
      { id: uid(), user_id: "admin-1", amount: 10, category: "بنزين", note: "", date: todayISO(), entry_method: "quick" }
    ],
    goals: [
      { id: uid(), user_id: "admin-1", name: "مدرسة عبدالرحمن", target_amount: 600, saved_amount: 150, due_date: "2026-08-01", priority: "high", status: "active" },
      { id: uid(), user_id: "admin-1", name: "سفرة", target_amount: 500, saved_amount: 100, due_date: "2026-08-15", priority: "medium", status: "active" }
    ],
    obligations: [
      { id: uid(), user_id: "admin-1", name: "اشتراك شهري", amount: 18, type: "continuous", due_day: 5, start_date: "2026-01-01", end_date: "", status: "active" },
      { id: uid(), user_id: "admin-1", name: "قسط مؤقت", amount: 120, type: "temporary", due_day: 10, start_date: "2026-01-01", end_date: "2026-12-31", status: "active" }
    ],
    ai_reports: []
  };
}

function loadDB(){
  const raw = localStorage.getItem(LS_KEY);
  if(raw){
    try { return JSON.parse(raw); } catch(e){}
  }
  const data = seedDB();
  localStorage.setItem(LS_KEY, JSON.stringify(data));
  return data;
}

function saveDB(){
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

function loadSession(){
  const raw = localStorage.getItem(SESSION_KEY);
  if(!raw) return null;
  try { return JSON.parse(raw); } catch(e){ return null; }
}

function saveSession(){
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function toast(message){
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 2500);
}

function currentUser(){
  return db.users.find(u => u.id === session?.user_id);
}

function requireUserItems(table){
  return db[table].filter(x => x.user_id === session.user_id);
}

function login(email, password){
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if(!user) return toast("بيانات الدخول غير صحيحة");
  if(user.status !== "active") return toast("الحساب موقوف");
  session = { user_id: user.id };
  saveSession();
  showApp();
}

function logout(){
  session = null;
  localStorage.removeItem(SESSION_KEY);
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
}

function showApp(){
  const user = currentUser();
  if(!user) return logout();

  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("roleBadge").textContent = user.role === "admin" ? "Admin" : "User";
  $("adminNavBtn").classList.toggle("hidden", user.role !== "admin");
  switchView("homeView");
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

function switchView(view){
  const user = currentUser();
  if(view === "adminView" && user.role !== "admin") return toast("هذه الصفحة للأدمن فقط");

  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $(view).classList.remove("hidden");

  document.querySelectorAll("[data-view]").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(`[data-view="${view}"]`).forEach(btn => btn.classList.add("active"));

  $("mobilePageTitle").textContent = pageTitle(view);
  renderAll();
  window.scrollTo({top:0, behavior:"smooth"});
}

function daysBetween(dateText){
  if(!dateText) return 0;
  const now = new Date();
  const target = new Date(dateText + "T00:00:00");
  const msDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.ceil((target - now) / msDay));
}

function isDateInCurrentCycle(dateText, nextSalaryDate){
  if(!dateText) return false;
  const d = new Date(dateText + "T00:00:00");
  const next = new Date(nextSalaryDate + "T00:00:00");
  const start = new Date(next);
  start.setMonth(start.getMonth() - 1);
  return d >= start && d <= next;
}

function calcSummary(){
  const salary = db.salaries[session.user_id] || { base_amount: 0, next_salary_date: todayISO(), note: "" };
  const incomesAll = requireUserItems("incomes");
  const expensesAll = requireUserItems("expenses");
  const obligations = requireUserItems("obligations").filter(o => o.status !== "inactive");
  const goals = requireUserItems("goals").filter(g => g.status !== "done");

  const nextSalaryDate = salary.next_salary_date || todayISO();
  const daysToSalary = daysBetween(nextSalaryDate);

  const extraIncomes = incomesAll.filter(i => isDateInCurrentCycle(i.date, nextSalaryDate));
  const cycleExpenses = expensesAll.filter(e => isDateInCurrentCycle(e.date, nextSalaryDate));

  const baseSalary = cleanNumber(salary.base_amount);
  const extraIncomeTotal = extraIncomes.reduce((s, i) => s + cleanNumber(i.amount), 0);
  const totalIncome = baseSalary + extraIncomeTotal;
  const totalExpenses = cycleExpenses.reduce((s, e) => s + cleanNumber(e.amount), 0);
  const incomeRemaining = totalIncome - totalExpenses;

  const today = new Date();
  const currentDay = today.getDate();

  const upcomingObligations = obligations
    .filter(o => {
      if(o.type === "temporary" && o.end_date){
        const end = new Date(o.end_date + "T00:00:00");
        if(end < today) return false;
      }
      return cleanNumber(o.due_day) >= currentDay;
    })
    .reduce((s, o) => s + cleanNumber(o.amount), 0);

  const nearGoals = goals.filter(g => daysBetween(g.due_date) <= 60);
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

  const nearestGoal = goals
    .map(g => ({...g, days_left: daysBetween(g.due_date)}))
    .sort((a,b) => a.days_left - b.days_left)[0];

  const todayExpenseTotal = expensesAll
    .filter(e => e.date === todayISO())
    .reduce((s,e) => s + cleanNumber(e.amount), 0);

  return {
    salary,
    baseSalary,
    nextSalaryDate,
    daysToSalary,
    incomesAll,
    extraIncomes,
    extraIncomeTotal,
    totalIncome,
    expensesAll,
    cycleExpenses,
    totalExpenses,
    incomeRemaining,
    obligations,
    upcomingObligations,
    goals,
    nearGoals,
    goalsRequiredNearTerm,
    realAvailable,
    dailySafe,
    topCategories,
    nearestGoal,
    todayExpenseTotal
  };
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
  $("continuousCount").textContent = s.obligations.filter(o => o.type === "continuous").length;
  $("temporaryCount").textContent = s.obligations.filter(o => o.type === "temporary").length;
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
    $("statusText").textContent = "المتاح الحقيقي بالسالب بعد خصم الالتزامات والأهداف القريبة. يفضل تقليل المصروفات الكمالية مؤقتًا.";
    $("realAvailableText").textContent = "تنبيه: المتاح الحقيقي أقل من صفر.";
  } else if(s.dailySafe < 5){
    status.innerHTML = `<span class="dot"></span> يحتاج متابعة`;
    $("statusText").textContent = "المبلغ اليومي المناسب منخفض. الأفضل مراقبة المصروفات اليومية.";
    $("realAvailableText").textContent = "متاح، لكن يحتاج متابعة يومية.";
  } else {
    status.classList.add("good");
    status.innerHTML = `<span class="dot"></span> مستقر`;
    $("statusText").textContent = "الوضع مقبول حسب البيانات المدخلة، مع الاستمرار بعدم تجاوز المبلغ اليومي المناسب.";
    $("realAvailableText").textContent = "بعد خصم الالتزامات القريبة واحتياج الأهداف.";
  }

  $("topCategoriesList").innerHTML = s.topCategories.length
    ? s.topCategories.map(([cat, amount]) => `
      <div class="item">
        <div><b>${cat}</b><small>مصروفات متغيرة</small></div>
        <div class="amount">${money(amount)}</div>
      </div>
    `).join("")
    : `<div class="muted">لا توجد مصروفات في الدورة الحالية.</div>`;
}

function renderIncome(){
  const s = calcSummary();
  $("baseSalaryAmount").value = s.salary.base_amount || "";
  $("nextSalaryDate").value = s.salary.next_salary_date || todayISO();
  $("salaryNote").value = s.salary.note || "";
  $("incomeDate").value ||= todayISO();

  $("incomeList").innerHTML = s.incomesAll.length
    ? s.incomesAll.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(i => `
      <div class="item">
        <div>
          <b>${i.source || "دخل آخر"}</b>
          <small>${i.date} — ${i.recurring === "yes" ? "متكرر" : "غير متكرر"}</small>
        </div>
        <div class="amount">${money(i.amount)}</div>
        <div class="item-actions">
          <button class="danger-btn" onclick="deleteItem('incomes','${i.id}')">حذف</button>
        </div>
      </div>
    `).join("")
    : `<div class="muted">لا يوجد دخل إضافي مسجل.</div>`;
}

function priorityLabel(priority){
  if(priority === "high") return "عالية";
  if(priority === "medium") return "متوسطة";
  return "منخفضة";
}

function renderGoals(){
  const goals = requireUserItems("goals").filter(g => g.status !== "done");
  $("goalsList").innerHTML = goals.length
    ? goals.map(g => {
      const target = Math.max(1, cleanNumber(g.target_amount));
      const saved = cleanNumber(g.saved_amount);
      const pct = Math.min(100, saved / target * 100);
      const need = Math.max(0, cleanNumber(g.target_amount) - saved);
      return `
        <div class="goal-card">
          <span class="priority ${g.priority}">${priorityLabel(g.priority)}</span>
          <h3>${g.name}</h3>
          <p class="muted">تاريخ الهدف: ${g.due_date} — باقي ${daysBetween(g.due_date)} يوم</p>
          <div class="progress"><span style="width:${pct}%"></span></div>
          <p>المطلوب: <b>${money(g.target_amount)}</b><br>المتوفر: <b>${money(g.saved_amount)}</b><br>المتبقي: <b>${money(need)}</b></p>
          <div class="item-actions">
            <button class="ghost-btn" onclick="addGoalSaving('${g.id}')">إضافة مبلغ</button>
            <button class="danger-btn" onclick="deleteItem('goals','${g.id}')">حذف</button>
          </div>
        </div>
      `;
    }).join("")
    : `<div class="muted">لا توجد أهداف نشطة.</div>`;
}

function renderObligations(){
  const obligations = requireUserItems("obligations").filter(o => o.status !== "inactive");
  $("obligationStartDate").value ||= todayISO();

  $("obligationsList").innerHTML = obligations.length
    ? obligations.map(o => `
      <div class="item">
        <div>
          <b>${o.name}</b>
          <small>${o.type === "continuous" ? "التزام مستمر" : "التزام مؤقت"} — يوم الاستحقاق ${o.due_day}${o.end_date ? " — ينتهي " + o.end_date : ""}</small>
        </div>
        <div class="amount">${money(o.amount)}</div>
        <div class="item-actions">
          <button class="danger-btn" onclick="deleteItem('obligations','${o.id}')">حذف</button>
        </div>
      </div>
    `).join("")
    : `<div class="muted">لا توجد التزامات مسجلة.</div>`;
}

function renderExpenses(){
  $("expenseDate").value ||= todayISO();
  const rows = requireUserItems("expenses").slice().sort((a,b)=>b.date.localeCompare(a.date));
  $("expensesList").innerHTML = rows.length
    ? rows.map(e => `
      <div class="item">
        <div>
          <b>${e.category}</b>
          <small>${e.date}${e.note ? " — " + e.note : ""}</small>
        </div>
        <div class="amount">${money(e.amount)}</div>
        <div class="item-actions">
          <button class="danger-btn" onclick="deleteItem('expenses','${e.id}')">حذف</button>
        </div>
      </div>
    `).join("")
    : `<div class="muted">لا توجد مصروفات مسجلة.</div>`;
}

function renderAdmin(){
  const user = currentUser();
  if(user.role !== "admin") return;

  $("usersList").innerHTML = db.users.map(u => `
    <div class="item">
      <div>
        <b>${u.name}</b>
        <small>${u.email} — ${u.role === "admin" ? "أدمن" : "مستخدم"} — ${u.status === "active" ? "نشط" : "موقوف"}</small>
      </div>
      <div class="item-actions">
        ${u.id !== user.id ? `<button class="ghost-btn" onclick="toggleUser('${u.id}')">${u.status === "active" ? "إيقاف" : "تفعيل"}</button>` : ""}
      </div>
    </div>
  `).join("");
}

function renderAll(){
  if(!currentUser()) return;
  renderHome();
  renderIncome();
  renderGoals();
  renderObligations();
  renderExpenses();
  renderAdmin();
}

function addExpense(amount, category, note = "", method = "quick", date = todayISO()){
  amount = cleanNumber(amount);
  if(!amount || amount <= 0) return toast("أدخل مبلغًا صحيحًا");
  db.expenses.push({
    id: uid(),
    user_id: session.user_id,
    amount,
    category,
    note,
    date,
    entry_method: method
  });
  saveDB();
  renderAll();
  toast("تم تسجيل المصروف");
}

function deleteItem(table, id){
  db[table] = db[table].filter(x => x.id !== id);
  saveDB();
  renderAll();
  toast("تم الحذف");
}

function addGoalSaving(id){
  const value = cleanNumber(prompt("كم تريد إضافة مبلغ لهذا الهدف؟"));
  if(!value || value <= 0) return;
  const goal = db.goals.find(g => g.id === id && g.user_id === session.user_id);
  if(!goal) return;
  goal.saved_amount = cleanNumber(goal.saved_amount) + value;
  saveDB();
  renderAll();
  toast("تم تحديث الهدف");
}

function toggleUser(id){
  const user = db.users.find(u => u.id === id);
  if(!user) return;
  user.status = user.status === "active" ? "suspended" : "active";
  saveDB();
  renderAll();
}

function buildAIPayload(){
  const s = calcSummary();
  return {
    instruction: "حلل فقط البيانات التالية. ممنوع اختراع أرقام أو افتراض دخل أو مصروف غير مذكور. إذا نقصت البيانات اذكر ذلك.",
    salary: {
      base_salary: s.baseSalary,
      next_salary_date: s.nextSalaryDate,
      days_to_salary: s.daysToSalary
    },
    calculated: {
      extra_income_total: Number(s.extraIncomeTotal.toFixed(3)),
      total_income: Number(s.totalIncome.toFixed(3)),
      total_expenses: Number(s.totalExpenses.toFixed(3)),
      income_remaining: Number(s.incomeRemaining.toFixed(3)),
      upcoming_obligations: Number(s.upcomingObligations.toFixed(3)),
      near_goals_required: Number(s.goalsRequiredNearTerm.toFixed(3)),
      real_available: Number(s.realAvailable.toFixed(3)),
      daily_safe_amount: Number(s.dailySafe.toFixed(3)),
      today_expenses: Number(s.todayExpenseTotal.toFixed(3))
    },
    top_categories: s.topCategories.map(([category, amount]) => ({category, amount: Number(amount.toFixed(3))})),
    goals: s.goals.map(g => ({
      name: g.name,
      target_amount: cleanNumber(g.target_amount),
      saved_amount: cleanNumber(g.saved_amount),
      due_date: g.due_date,
      priority: priorityLabel(g.priority)
    })),
    obligations: s.obligations.map(o => ({
      name: o.name,
      amount: cleanNumber(o.amount),
      type: o.type === "continuous" ? "مستمر" : "مؤقت",
      due_day: cleanNumber(o.due_day),
      end_date: o.end_date || null
    }))
  };
}

function localAI(questionType, customQuestion = ""){
  const s = calcSummary();
  const missing = [];
  if(!s.baseSalary) missing.push("الراتب الأساسي");
  if(!s.nextSalaryDate) missing.push("تاريخ الراتب القادم");

  const lines = [];
  lines.push("تحليل وازن بناءً على البيانات المدخلة فقط:");
  lines.push("");

  if(missing.length){
    lines.push(`البيانات الناقصة: ${missing.join("، ")}.`);
    lines.push("");
  }

  lines.push(`الدخل الكلي في الدورة الحالية: ${money(s.totalIncome)}.`);
  lines.push(`إجمالي المصروفات المسجلة: ${money(s.totalExpenses)}.`);
  lines.push(`المتبقي من الدخل: ${money(s.incomeRemaining)}.`);
  lines.push(`المتاح الحقيقي للصرف: ${money(s.realAvailable)}.`);
  lines.push(`المبلغ المناسب يوميًا حتى الراتب القادم: ${money(s.dailySafe)}.`);
  lines.push("");

  if(questionType === "today"){
    if(s.dailySafe <= 0) lines.push("اليوم لا يوجد مجال آمن للصرف حسب البيانات الحالية، لأن المتاح الحقيقي غير كافٍ.");
    else lines.push(`تستطيع الصرف اليوم بشرط أن يكون قريبًا من ${money(s.dailySafe)} أو أقل، حتى لا يتأثر وصولك للراتب القادم.`);
  } else if(questionType === "pressure"){
    const pressures = [];
    if(s.upcomingObligations > 0) pressures.push(`الالتزامات القريبة: ${money(s.upcomingObligations)}`);
    if(s.goalsRequiredNearTerm > 0) pressures.push(`احتياج الأهداف القريبة: ${money(s.goalsRequiredNearTerm)}`);
    if(s.topCategories[0]) pressures.push(`أعلى بند صرف: ${s.topCategories[0][0]} بقيمة ${money(s.topCategories[0][1])}`);
    lines.push(pressures.length ? `أكثر عناصر الضغط الحالية:\n- ${pressures.join("\n- ")}` : "لا توجد عناصر ضغط واضحة لأن البيانات المسجلة قليلة.");
  } else if(questionType === "reduce"){
    if(s.topCategories[0]) lines.push(`ابدأ بتخفيف بند ${s.topCategories[0][0]} لأنه أعلى بند صرف مسجل في الدورة الحالية.`);
    else lines.push("لا توجد مصروفات كافية لتحديد بند يمكن تخفيفه.");
  } else {
    if(s.realAvailable < 0) lines.push("الحالة: ضغط مالي. المتاح الحقيقي بالسالب بعد الالتزامات والأهداف القريبة.");
    else if(s.dailySafe < 5) lines.push("الحالة: تحتاج متابعة. المبلغ اليومي المناسب منخفض.");
    else lines.push("الحالة: مستقرة مبدئيًا حسب البيانات الحالية.");
  }

  if(s.nearestGoal){
    const need = Math.max(0, cleanNumber(s.nearestGoal.target_amount) - cleanNumber(s.nearestGoal.saved_amount));
    lines.push("");
    lines.push(`أقرب هدف: ${s.nearestGoal.name}، والمتبقي له ${money(need)}، وتاريخه ${s.nearestGoal.due_date}.`);
  }

  if(customQuestion){
    lines.push("");
    lines.push(`سؤالك: ${customQuestion}`);
    lines.push("الإجابة أعلاه مبنية على الأرقام المتاحة فقط، ولا تضيف أرقامًا غير موجودة.");
  }

  lines.push("");
  lines.push("ملاحظة: هذا تحليل تنظيمي للمصروفات وليس نصيحة استثمارية أو ائتمانية.");
  return lines.join("\n");
}

function runAI(questionType = "summary"){
  const custom = $("customAiQuestion").value.trim();
  const answer = localAI(questionType, custom);
  $("aiAnswer").textContent = answer;
  db.ai_reports.push({
    id: uid(),
    user_id: session.user_id,
    input_summary: buildAIPayload(),
    ai_output: answer,
    created_at: new Date().toISOString()
  });
  saveDB();
}

document.addEventListener("DOMContentLoaded", () => {
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    login($("loginEmail").value.trim(), $("loginPassword").value);
  });

  $("logoutBtn").addEventListener("click", logout);
  $("mobileLogoutBtn").addEventListener("click", logout);

  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  $("saveSalaryBtn").addEventListener("click", () => {
    db.salaries[session.user_id] = {
      base_amount: cleanNumber($("baseSalaryAmount").value),
      next_salary_date: $("nextSalaryDate").value || todayISO(),
      note: $("salaryNote").value.trim()
    };
    saveDB();
    renderAll();
    toast("تم حفظ الراتب");
  });

  $("addIncomeBtn").addEventListener("click", () => {
    const amount = cleanNumber($("incomeAmount").value);
    const source = $("incomeSource").value.trim();
    if(!amount || amount <= 0) return toast("أدخل مبلغ الدخل");
    if(!source) return toast("أدخل مصدر الدخل");

    db.incomes.push({
      id: uid(),
      user_id: session.user_id,
      amount,
      source,
      date: $("incomeDate").value || todayISO(),
      recurring: $("incomeRecurring").value
    });
    saveDB();
    $("incomeAmount").value = "";
    $("incomeSource").value = "";
    $("incomeRecurring").value = "no";
    renderAll();
    toast("تمت إضافة الدخل");
  });

  $("addQuickExpenseBtn").addEventListener("click", () => {
    addExpense(
      $("quickExpenseAmount").value,
      $("quickExpenseCategory").value,
      $("quickExpenseNote").value.trim(),
      "quick"
    );
    $("quickExpenseAmount").value = "";
    $("quickExpenseNote").value = "";
  });

  document.querySelectorAll("[data-template-category]").forEach(btn => {
    btn.addEventListener("click", () => {
      addExpense(btn.dataset.templateAmount, btn.dataset.templateCategory, "قالب سريع", "template");
    });
  });

  $("addExpenseBtn").addEventListener("click", () => {
    addExpense(
      $("expenseAmount").value,
      $("expenseCategory").value,
      $("expenseNote").value.trim(),
      "detailed",
      $("expenseDate").value || todayISO()
    );
    $("expenseAmount").value = "";
    $("expenseNote").value = "";
  });

  $("addGoalBtn").addEventListener("click", () => {
    const name = $("goalName").value.trim();
    const target = cleanNumber($("goalTargetAmount").value);
    const due = $("goalDueDate").value;
    if(!name) return toast("أدخل اسم الهدف");
    if(!target || target <= 0) return toast("أدخل مبلغ الهدف");
    if(!due) return toast("أدخل تاريخ الهدف");

    db.goals.push({
      id: uid(),
      user_id: session.user_id,
      name,
      target_amount: target,
      saved_amount: cleanNumber($("goalSavedAmount").value),
      due_date: due,
      priority: $("goalPriority").value,
      status: "active"
    });
    saveDB();
    ["goalName","goalTargetAmount","goalDueDate"].forEach(id => $(id).value = "");
    $("goalSavedAmount").value = "0";
    $("goalPriority").value = "high";
    renderAll();
    toast("تم حفظ الهدف");
  });

  $("addObligationBtn").addEventListener("click", () => {
    const name = $("obligationName").value.trim();
    const amount = cleanNumber($("obligationAmount").value);
    const dueDay = cleanNumber($("obligationDueDay").value);
    if(!name) return toast("أدخل اسم الالتزام");
    if(!amount || amount <= 0) return toast("أدخل مبلغ الالتزام");
    if(!dueDay || dueDay < 1 || dueDay > 31) return toast("أدخل يوم استحقاق صحيح");

    db.obligations.push({
      id: uid(),
      user_id: session.user_id,
      name,
      amount,
      type: $("obligationType").value,
      due_day: dueDay,
      start_date: $("obligationStartDate").value || todayISO(),
      end_date: $("obligationEndDate").value,
      status: "active"
    });
    saveDB();
    ["obligationName","obligationAmount","obligationDueDay","obligationEndDate"].forEach(id => $(id).value = "");
    $("obligationType").value = "continuous";
    $("obligationStartDate").value = todayISO();
    renderAll();
    toast("تم حفظ الالتزام");
  });

  document.querySelectorAll("[data-ai-question]").forEach(btn => {
    btn.addEventListener("click", () => runAI(btn.dataset.aiQuestion));
  });
  $("askAiBtn").addEventListener("click", () => runAI("custom"));

  $("addUserBtn").addEventListener("click", () => {
    const user = currentUser();
    if(user.role !== "admin") return toast("هذه الصلاحية للأدمن فقط");
    const name = $("newUserName").value.trim();
    const email = $("newUserEmail").value.trim().toLowerCase();
    const password = $("newUserPassword").value || "123456";
    const role = $("newUserRole").value;
    if(!name || !email) return toast("أكمل بيانات الحساب");
    if(db.users.some(u => u.email.toLowerCase() === email)) return toast("البريد موجود مسبقًا");

    db.users.push({
      id: uid(),
      name,
      email,
      password,
      role,
      status: "active",
      created_at: todayISO()
    });
    saveDB();
    $("newUserName").value = "";
    $("newUserEmail").value = "";
    $("newUserPassword").value = "123456";
    $("newUserRole").value = "user";
    renderAll();
    toast("تمت إضافة الحساب");
  });

  if(session && currentUser()){
    showApp();
  }
});
