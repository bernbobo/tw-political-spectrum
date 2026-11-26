(function () {
  "use strict";
  var D = window.QUIZ;
  var STORE = "tw-political-spectrum-v2";
  var LIKERT = [["非常同意", 2], ["同意", 1], ["中立", 0], ["不同意", -1], ["非常不同意", -2]];
  var dimBy = {}; D.dims.forEach(function (d) { dimBy[d.k] = d; });
  dimBy.sq = { k: "sq", n: "現狀維持傾向", neg: "傾向終須抉擇", pos: "傾向維持現狀" };

  // 作答順序：先兩道 TEDS 參照題，再依維度排列的李克特題
  var seq = D.ref.map(function (r) { return { type: "ref", key: r.key }; })
    .concat(D.Q.map(function (q) { return { type: "q", i: q.i }; }));

  var state = load();
  var view = "start";
  var app = document.getElementById("app");
  var live = document.getElementById("live");

  function load() {
    try { var s = JSON.parse(localStorage.getItem(STORE)); if (s && s.v === 2) return s; } catch (e) {}
    return { v: 2, ans: {}, ref: {}, pos: 0 };
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }
  function clearAll() { state = { v: 2, ans: {}, ref: {}, pos: 0 }; try { localStorage.removeItem(STORE); } catch (e) {} }
  function answeredCount() { return Object.keys(state.ans).length + Object.keys(state.ref).length; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ext(u, t) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(t) + "</a>"; }

  /* ---------- 計分 ---------- */
  function compute() {
    var axes = {}, keys = D.axisOrder.concat(["sq"]);
    keys.forEach(function (k) {
      var items = D.Q.filter(function (q) { return q.d === k; });
      var sum = 0, valid = 0, unsure = 0, seen = 0;
      items.forEach(function (q) {
        var a = state.ans[q.i];
        if (a === undefined) return;
        seen++;
        if (a === "u") { unsure++; return; }
        sum += a * q.s; valid++;
      });
      var minValid = Math.ceil(items.length / 2);
      axes[k] = { k: k, n: items.length, valid: valid, unsure: unsure, seen: seen,
        score: valid ? Math.round(sum / (valid * 2) * 100) : null,
        low: valid > 0 && valid < minValid };
    });
    // 一致性
    var checked = 0, bad = 0, badList = [];
    D.pairs.forEach(function (p) {
      var a = state.ans[p[0]], b = state.ans[p[1]];
      if (typeof a !== "number" || typeof b !== "number" || a === 0 || b === 0) return;
      checked++;
      var x = a * D.Q[p[0]].s, y = b * D.Q[p[1]].s;
      if (x * y < 0) { bad++; badList.push(p); }
    });
    // 默許傾向（不論方向一律同意或一律不同意）
    var agree = 0, disagree = 0, nonNeutral = 0;
    Object.keys(state.ans).forEach(function (i) { var a = state.ans[i]; if (typeof a === "number" && a !== 0) { nonNeutral++; if (a > 0) agree++; else disagree++; } });
    var acq = nonNeutral >= 20 ? Math.max(agree, disagree) / nonNeutral : null;
    // 藍綠綜合指數（不含國防與外交）
    var bgPack = blueGreen(axes);
    var bg = bgPack.bg, cross = bgPack.cross, core = bgPack.core, wSum = bgPack.bgW;
    // 政黨接近度
    var usable = D.axisOrder.map(function (k, j) { return { k: k, j: j }; }).filter(function (x) { return axes[x.k].score !== null; });
    var parties = usable.length >= 3 ? D.parties.map(function (p) {
      var diff = usable.reduce(function (s, x) { return s + Math.abs(axes[x.k].score - p.v[x.j]); }, 0) / usable.length;
      return { p: p, sim: Math.round(100 - diff / 2) };
    }).sort(function (a, b) { return b.sim - a.sim; }) : [];
    var totalUnsure = Object.keys(state.ans).filter(function (i) { return state.ans[i] === "u"; }).length;
    return { axes: axes, checked: checked, bad: bad, badList: badList, acq: acq, bg: bg, bgW: wSum, parties: parties, usable: usable.length, totalUnsure: totalUnsure, cross: cross, core: core };
  }
  function coreList(axes) {
    return [
      { k: "id", short: "認同", score: axes.id ? axes.id.score : null },
      { k: "cs", short: "兩岸", score: axes.cs ? axes.cs.score : null },
      { k: "tj", short: "轉正", score: axes.tj ? axes.tj.score : null }
    ];
  }
  function isCross(list) {
    var s = [];
    list.forEach(function (x) { if (x.score !== null && x.score !== undefined) s.push(x.score); });
    if (s.length < 2) return false;
    var mx = Math.max.apply(Math, s), mn = Math.min.apply(Math, s);
    return (mx >= 20 && mn <= -10) || (mx >= 10 && mn <= -20) || (mx - mn >= 55);
  }
  function blueGreen(axes) {
    var wSum = 0, sSum = 0;
    Object.keys(D.bgWeights).forEach(function (k) {
      var ax = axes[k];
      if (ax && ax.score !== null) { wSum += D.bgWeights[k]; sSum += D.bgWeights[k] * ax.score; }
    });
    var bg = wSum >= 0.5 ? Math.round(sSum / wSum) : null;
    var core = coreList(axes);
    return { bg: bg, bgW: wSum, cross: bg !== null && isCross(core), core: core };
  }
  function fmt(v) { return v === null ? "—" : v > 0 ? "+" + v : v < 0 ? "−" + Math.abs(v) : "0"; }
  function lvl(v) { if (v === null) return null; var a = Math.abs(v); return a < 20 ? 0 : a < 55 ? 1 : 2; }
  function axisWord(v, d) { var l = lvl(v); if (l === null) return "資料不足"; if (l === 0) return "居中"; return (l === 2 ? "明顯偏向" : "偏向") + (v > 0 ? d.pos : d.neg); }
  function bgBase(v) {
    if (v >= 55) return "深綠"; if (v >= 20) return "淺綠"; if (v > -20) return "中間"; if (v > -55) return "淺藍"; return "深藍";
  }
  function bgLabel(v, cross) {
    if (v === null) return "資料不足";
    var base = bgBase(v);
    if (!cross) return base;
    if (v > -20 && v < 20) {
      if (v >= 10) return "中間偏綠 · 立場交錯";
      if (v <= -10) return "中間偏藍 · 立場交錯";
      return "中間 · 立場交錯";
    }
    return base + " · 立場交錯";
  }
  function bgDesc(v, cross) {
    if (v === null) return "國家認同、兩岸政策、轉型正義這三個面向的有效作答太少，無法估計。國防與外交不併入藍綠指數。";
    if (cross) return "國家認同、兩岸政策與轉型正義拉向不同方向。加權後的位置是這三個面向互相折衷的結果，不是每個面向都居中，也不是沒有立場。";
    if (v >= 55) return "在國家認同、兩岸、轉型正義這三個核心面向，你的立場與泛綠陣營的核心主張高度重疊，而且方向大致一致。";
    if (v >= 20) return "你在藍綠主軸上偏向泛綠，三個核心面向的方向也大致一致。";
    if (v > -20) return "你在藍綠主軸上沒有明顯站邊，三個核心面向也沒有互相拉扯。";
    if (v > -55) return "你在藍綠主軸上偏向泛藍，三個核心面向的方向也大致一致。";
    return "在國家認同、兩岸、轉型正義這三個核心面向，你的立場與泛藍陣營的核心主張高度重疊，而且方向大致一致。";
  }
  function bgPill(x) {
    return '<span class="bg-pill"><span>' + esc(x.short) + "</span><b>" + esc(x.score === null ? "資料不足" : fmt(x.score)) + "</b></span>";
  }
  function bgBreakHtml(core) {
    var g = [], b = [], z = [], u = [];
    core.forEach(function (x) {
      if (x.score === null) u.push(x);
      else if (x.score > 0) g.push(x);
      else if (x.score < 0) b.push(x);
      else z.push(x);
    });
    if (g.length && b.length) {
      return '<div class="bg-split">' +
        '<div class="bg-split-row"><span class="bg-tag g">往綠拉</span>' + g.map(bgPill).join("") + "</div>" +
        '<div class="bg-split-row"><span class="bg-tag b">往藍拉</span>' + b.map(bgPill).join("") + "</div>" +
        (z.length ? '<div class="bg-split-row"><span class="bg-tag">居中</span>' + z.map(bgPill).join("") + "</div>" : "") +
        (u.length ? '<div class="bg-split-row">' + u.map(bgPill).join("") + "</div>" : "") +
        "</div>";
    }
    return '<div class="bg-axes">' + core.map(bgPill).join("") + "</div>";
  }
  function bgMeterHtml(r) {
    var core = r.core || [];
    var any = r.bg !== null || core.some(function (x) { return x.score !== null; });
    if (!any) return "";
    var ticks = core.filter(function (x) { return x.score !== null; }).map(function (x) {
      return '<span class="bg-tick" style="left:' + ((x.score + 100) / 2) + '%" aria-hidden="true"></span>';
    }).join("");
    var dot = r.bg === null ? "" : '<i class="bg-dot" style="left:' + ((r.bg + 100) / 2) + '%"></i>';
    var aria = "藍綠綜合指數 " + fmt(r.bg) + "，範圍 −100（深藍）到 +100（深綠）。" + core.map(function (x) {
      return x.short + (x.score === null ? "資料不足" : fmt(x.score));
    }).join("，");
    return '<div class="bg-meter" role="img" aria-label="' + esc(aria) + '">' + ticks + dot + "</div>" +
      bgBreakHtml(core) +
      '<div class="bg-scale"><span>深藍 −100</span><span>中間</span><span>+100 深綠</span></div>' +
      '<p class="muted bg-hint">圓點是加權指數，短線是認同、兩岸、轉正各自的位置。</p>';
  }
  function pullLines(core) {
    var g = [], b = [], rest = [];
    core.forEach(function (x) {
      var label = x.short + " " + (x.score === null ? "資料不足" : fmt(x.score));
      if (x.score === null || x.score === 0) rest.push(label);
      else if (x.score > 0) g.push(label);
      else b.push(label);
    });
    if (g.length && b.length) {
      var lines = [
        { color: "#15803d", text: "往綠拉：" + g.join("、") },
        { color: "#1d4ed8", text: "往藍拉：" + b.join("、") }
      ];
      if (rest.length) lines.push({ color: "#4a4a52", text: rest.join("、") });
      return lines;
    }
    return [{ color: "#18181b", text: core.map(function (x) { return x.short + " " + (x.score === null ? "資料不足" : fmt(x.score)); }).join("    ") }];
  }
  function comboTags(r) {
    var t = [], A = r.axes;
    function add(k, p, n) { var v = A[k].score; if (v === null) return; if (v >= 20) t.push(p); else if (v <= -20) t.push(n); }
    add("id", "國族認同偏台灣主體", "國族認同偏中國／統一");
    add("cs", "兩岸政策偏防衛", "兩岸政策偏交流");
    var e = [A.dist.score, A.mkt.score].filter(function (x) { return x !== null; });
    if (e.length) { var m = e.reduce(function (a, b) { return a + b; }, 0) / e.length; t.push(m >= 20 ? "經濟偏左" : m <= -20 ? "經濟偏右" : "經濟居中"); }
    add("soc", "社會偏自由進步", "社會偏傳統");
    add("env", "環境優先", "開發優先");
    add("nuc", "傾向非核", "支持核能");
    add("dem", "重視直接參與與言論自由", "重視代議穩定與管制");
    return t;
  }

  /* ---------- 共用 ---------- */
  function setView(v) { view = v; render(); window.scrollTo(0, 0); }
  function nav() {
    var items = [["start", "首頁"], ["method", "方法與限制"]];
    if (answeredCount() > 0) items.splice(1, 0, ["result", "結果"]);
    document.getElementById("nav").innerHTML = items.map(function (x) {
      return '<button type="button" data-go="' + x[0] + '"' + (view === x[0] ? ' aria-current="page"' : "") + ">" + x[1] + "</button>";
    }).join("");
  }
  function testsBlock() {
    return '<ul class="links">' + D.tests.map(function (t) {
      return '<li><a href="' + esc(t.u) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(t.t) + "</b><span>" + esc(t.d) + "</span></a></li>";
    }).join("") + "</ul>";
  }
  function toast(msg) {
    var el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2200);
  }

  /* ---------- 開始頁 ---------- */
  function renderStart() {
    var n = answeredCount(), total = seq.length, resume = n > 0 && n < total, done = n >= total;
    var dimsChips = D.dims.map(function (d) { return "<li>" + esc(d.n) + "</li>"; }).join("");
    app.innerHTML =
      '<h1 id="title" tabindex="-1">台灣人的政治光譜</h1>' +
      '<p class="lede">用 ' + total + ' 道題目，從國家認同、兩岸、經濟、社會、環境到民主制度等 12 個面向，看你落在台灣政治光譜的哪裡；結果是多個軸的組合，而不是單一標籤。</p>' +
      '<div class="stats"><div class="stat"><b>' + total + '</b><span>題</span></div><div class="stat"><b>12</b><span>個面向</span></div><div class="stat"><b>15–20</b><span>分鐘</span></div></div>' +
      '<div class="actions">' +
        (resume ? '<button class="btn primary" type="button" data-act="resume">繼續作答（已答 ' + n + "／" + total + "）</button>" : "") +
        (done ? '<button class="btn primary" type="button" data-go="result">查看結果</button>' : "") +
        (!resume && !done ? '<button class="btn primary" type="button" data-act="begin">開始作答</button>' : "") +
        (n > 0 ? '<button class="btn" type="button" data-act="restart">清除並重新開始</button>' : "") +
      "</div>" +
      '<h2>測量的面向</h2><ul class="chips">' + dimsChips + "</ul>" +
      '<p class="muted">另外有兩道沿用政大選研中心長期民調的參照題，以及「現狀維持傾向」指標。</p>' +
      '<h2>怎麼作答、怎麼計分</h2><div class="card"><ul class="plain">' +
        "<li>每題五個選項：非常同意、同意、中立、不同意、非常不同意，另有「不確定／沒有意見」。</li>" +
        "<li>每個面向 6–8 題，同意代表靠左或靠右的題目各占一半，降低「一律同意」造成的偏差。</li>" +
        "<li>「不確定」不計入平均；某面向有效作答不到一半時，結果會標示「可信度低」。</li>" +
        "<li>結果包含各面向分數（−100 到 +100）、藍綠位置、與各政黨概括位置的接近度，以及作答一致性提示。</li>" +
      '</ul><p class="muted">完整規則見 <button class="btn ghost" style="padding:0;min-height:0" type="button" data-go="method">方法與限制</button>。</p></div>' +
      '<h2>隱私</h2><div class="card"><p>這個網站不收集任何資料：沒有帳號、沒有分析或追蹤程式，也不載入任何外部資源。作答只在你的瀏覽器裡計算，進度存在這台裝置的瀏覽器儲存空間（localStorage），方便你中途離開後繼續；按「清除並重新開始」即可刪除。</p></div>' +
      '<h2>其他現成測驗</h2>' + testsBlock();
  }

  /* ---------- 作答頁 ---------- */
  function currentItem() { return seq[Math.min(state.pos, seq.length - 1)]; }
  function itemAnswer(it) { return it.type === "ref" ? state.ref[it.key] : state.ans[it.i]; }
  function renderQuiz() {
    var it = currentItem(), pos = Math.min(state.pos, seq.length - 1), total = seq.length;
    var done = answeredCount();
    var label, text, opts, cur = itemAnswer(it), hint;
    if (it.type === "ref") {
      var r = D.ref.filter(function (x) { return x.key === it.key; })[0];
      label = "參照題（不計分）"; text = r.t;
      opts = r.opts.map(function (o, j) { return { label: o, val: j, unsure: j === r.opts.length - 1 }; });
      hint = "按 <kbd>1</kbd>–<kbd>" + r.opts.length + "</kbd> 選擇";
    } else {
      var q = D.Q[it.i], d = dimBy[q.d];
      label = d.n + (q.sub ? "・" + q.sub : ""); text = q.t;
      opts = LIKERT.map(function (o) { return { label: o[0], val: o[1] }; }).concat([{ label: "不確定／沒有意見", val: "u", unsure: true }]);
      hint = "按 <kbd>1</kbd>–<kbd>5</kbd> 作答、<kbd>0</kbd> 不確定";
    }
    var optHtml = opts.map(function (o, j) {
      var key = it.type === "ref" ? String(j + 1) : (o.val === "u" ? "0" : String(j + 1));
      var on = cur === o.val;
      return '<button type="button" role="radio" class="opt' + (o.unsure ? " unsure" : "") + '" aria-checked="' + on + '" data-val="' + esc(String(o.val)) + '" tabindex="' + (on || (cur === undefined && j === 0) ? 0 : -1) + '"><span class="k" aria-hidden="true">' + key + "</span><span>" + esc(o.label) + "</span></button>";
    }).join("");
    app.innerHTML =
      '<div class="progress-wrap"><div class="progress-meta"><span>第 ' + (pos + 1) + " 題／共 " + total + ' 題</span><span>已答 ' + done + '</span></div>' +
      '<div class="bar" role="progressbar" aria-label="作答進度" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '"><i style="width:' + (done / total * 100).toFixed(1) + '%"></i></div></div>' +
      '<section class="qcard" aria-labelledby="qtext"><span class="qdim">' + esc(label) + '</span>' +
      '<p class="qtext" id="qtext" tabindex="-1">' + esc(text) + "</p>" +
      '<div class="opts" role="radiogroup" aria-labelledby="qtext">' + optHtml + "</div>" +
      '<div class="qnav"><button class="btn" type="button" data-act="prev"' + (pos === 0 ? " disabled" : "") + '>← 上一題</button>' +
      (done >= total ? '<button class="btn primary" type="button" data-go="result">查看結果</button>' :
        '<button class="btn ghost" type="button" data-act="next"' + (cur === undefined ? " disabled" : "") + ">下一題 →</button>") + "</div>" +
      '<p class="kbd-hint">' + hint + "，<kbd>←</kbd> 上一題，<kbd>→</kbd> 下一題。進度會自動保存在這台裝置。</p></section>" +
      '<div class="actions"><button class="btn ghost" type="button" data-go="start">先離開，稍後繼續</button>' +
      (done >= 10 ? '<button class="btn ghost" type="button" data-go="result">用目前答案看結果</button>' : "") + "</div>";
    live.textContent = "第 " + (pos + 1) + " 題，共 " + total + " 題。" + text;
    var qt = document.getElementById("qtext"); if (qt) qt.focus({ preventScroll: true });
  }
  function pick(val) {
    var it = currentItem();
    if (it.type === "ref") state.ref[it.key] = Number(val);
    else state.ans[it.i] = val === "u" ? "u" : Number(val);
    save();
    var total = seq.length;
    if (state.pos < total - 1) { renderQuiz(); setTimeout(function () { state.pos++; save(); renderQuiz(); }, 170); }
    else if (answeredCount() >= total) { setView("result"); }
    else { // 最後一題但前面有漏答：跳到第一個未答
      var j = seq.findIndex(function (x) { return itemAnswer(x) === undefined; });
      state.pos = j < 0 ? total - 1 : j; save(); renderQuiz();
    }
  }

  /* ---------- 圖表 ---------- */
  function radarSVG(r) {
    var ks = D.axisOrder, n = ks.length, R = 120, cx = 210, cy = 170, out = "";
    function pt(i, rad) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; }
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      out += '<polygon points="' + ks.map(function (_, i) { return pt(i, R * f).join(","); }).join(" ") + '" fill="none" stroke="var(--line' + (f === 0.5 ? "-strong" : "") + ')" stroke-width="1"/>';
    });
    ks.forEach(function (_, i) { var p = pt(i, R); out += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="var(--line)"/>'; });
    var poly = ks.map(function (k, i) { var s = r.axes[k].score; return pt(i, R * ((s === null ? 0 : s) + 100) / 200).join(","); }).join(" ");
    out += '<polygon points="' + poly + '" fill="var(--accent)" fill-opacity=".22" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>';
    ks.forEach(function (k, i) {
      var s = r.axes[k].score, p = pt(i, R * ((s === null ? 0 : s) + 100) / 200);
      if (s !== null) out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="var(--accent)"/>';
      var a = -Math.PI / 2 + i * 2 * Math.PI / n, lx = cx + (R + 18) * Math.cos(a), ly = cy + (R + 18) * Math.sin(a);
      var anc = Math.cos(a) > 0.25 ? "start" : Math.cos(a) < -0.25 ? "end" : "middle";
      out += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + anc + '" dominant-baseline="middle" font-size="12" fill="var(--text-2)">' + esc(dimBy[k].s) + "</text>";
    });
    return '<svg viewBox="0 0 420 340" role="img" aria-label="12 個面向分數的雷達圖；圓心為 −100，最外圈為 +100，中間粗線為 0">' + out + "</svg>";
  }
  function axisRow(k, r, interp) {
    var ax = r.axes[k], d = dimBy[k], v = ax.score;
    var w = v === null ? 0 : Math.abs(v) / 2;
    var fillStyle = v === null ? "" : (v >= 0 ? "left:50%;border-radius:0 999px 999px 0;" : "right:50%;border-radius:999px 0 0 999px;") + "width:" + w + "%";
    var txt = "";
    if (interp && v !== null) txt = "<p>" + esc(lvl(v) === 0 ? d.midT : v > 0 ? d.posT : d.negT) + "</p>";
    var meta = v === null ? "資料不足" : fmt(v) + "・" + axisWord(v, d);
    return '<div class="axis"><div class="axis-head"><b>' + esc(d.n) + (ax.low ? '<span class="tag-low">可信度低</span>' : "") + '</b><span class="score">' + esc(meta) + "</span></div>" +
      '<div class="track" role="img" aria-label="' + esc(d.n + "：" + meta + "；範圍 −100（" + d.neg + "）到 +100（" + d.pos + "）") + '"><div class="mid"></div>' + (v === null ? "" : '<div class="fill" style="' + fillStyle + '"></div>') + "</div>" +
      '<div class="poles"><span>−100 ' + esc(d.neg) + "</span><span>" + esc(d.pos) + " +100</span></div>" +
      '<p class="muted" style="margin-top:2px">有效 ' + ax.valid + "／" + ax.n + " 題" + (ax.unsure ? "，不確定 " + ax.unsure + " 題" : "") + "</p>" + txt + "</div>";
  }

  /* ---------- 結果頁 ---------- */
  function renderResult() {
    var r = compute(), n = answeredCount(), total = seq.length;
    if (n === 0) { app.innerHTML = '<h1 id="title" tabindex="-1">還沒有作答</h1><div class="actions"><button class="btn primary" type="button" data-act="begin">開始作答</button></div>'; return; }
    var tags = comboTags(r);
    var notes = "";
    if (n < total) notes += '<div class="notice warn">你還有 ' + (total - n) + " 題沒作答，結果只依已答部分計算。</div>";
    if (r.checked >= 3) {
      notes += r.bad === 0 ? '<div class="notice ok">作答一致性良好：' + r.checked + " 組正反配對題都沒有互相矛盾。</div>"
        : '<div class="notice warn">作答一致性提示：' + r.checked + " 組正反配對題中有 " + r.bad + " 組方向互相矛盾（例如「" + esc(D.Q[r.badList[0][0]].t) + "」與「" + esc(D.Q[r.badList[0][1]].t) + "」答了同一方向）。" + (r.bad >= 2 ? "結果的可信度可能偏低，可回頭檢查這些題目。" : "可能是題意理解不同，也可能是真實的複雜立場。") + "</div>";
    }
    if (r.acq !== null && r.acq >= 0.85) notes += '<div class="notice warn">你有 ' + Math.round(r.acq * 100) + "% 的非中立答案落在同一邊（一律同意或一律不同意）。由於題目正反向各半，這種作答方式會讓分數向中間靠攏。</div>";
    if (r.totalUnsure >= 10) notes += '<div class="notice warn">你選了 ' + r.totalUnsure + " 題「不確定」，這些題目不計入分數；標示「可信度低」的面向請保守解讀。</div>";

    var refHtml = "";
    if (state.ref.tw_cn !== undefined || state.ref.six !== undefined) {
      var R0 = D.ref[0], R1 = D.ref[1];
      refHtml = '<h2>參照題：與全台民調對照</h2><div class="card">' +
        (state.ref.tw_cn !== undefined ? "<p>台灣人／中國人認同：<b>" + esc(R0.opts[state.ref.tw_cn]) + "</b></p>" : "") +
        (state.ref.six !== undefined ? "<p>統獨立場（六分類）：<b>" + esc(R1.opts[state.ref.six]) + "</b></p>" : "") +
        '<p class="muted">政大選舉研究中心 2026 年 6 月的趨勢資料：自認「台灣人」63.1%、「都是」30.7%、「中國人」2.5%；統獨立場傾向統一 6.9%、維持現狀 60.5%、傾向獨立 26.5%（合併後的三大類）。來源：' +
        ext("https://esc.nccu.edu.tw/PageDoc/Detail?fid=7804&id=6960", "認同趨勢") + "、" + ext("https://esc.nccu.edu.tw/PageDoc/Detail?fid=7805&id=6962", "統獨趨勢") + "；數字引自" + ext("https://www.upmedia.mg/tw/commentary/political-and-economics-debate/263212", "小笠原欣幸整理") + "。</p></div>";
    }
    var sq = r.axes.sq;
    var sqHtml = sq.score === null ? "" : '<div class="card" style="margin-top:12px"><b>現狀維持傾向</b>：' + fmt(sq.score) + "・" + esc(axisWord(sq.score, dimBy.sq)) +
      '<p class="muted">此指標不併入統獨軸：想維持現狀的人可能偏統、偏獨或都不偏，政大選研中心的資料也顯示多數民眾選擇各種「維持現狀」。</p></div>';

    var partyHtml = r.parties.length ? r.parties.map(function (x) {
      return '<div class="party"><div class="party-head"><b>' + esc(x.p.n) + '</b><span class="score">' + x.sim + '%</span></div><div class="pbar" aria-hidden="true"><i style="width:' + Math.max(0, x.sim) + '%"></i></div><p class="muted">' + esc(x.p.desc) + "</p></div>";
    }).join("") : '<p class="muted">有效作答的面向不足 3 個，無法計算。</p>';
    var strong = D.axisOrder.filter(function (k) { var v = r.axes[k].score; return v !== null && Math.abs(v) >= 20; }).length;
    if (r.parties.length && strong < 3) partyHtml = '<div class="notice warn" style="margin:0 0 8px">你的各面向大多居中，這時接近度主要反映各政黨本身離中心多遠，參考價值有限。</div>' + partyHtml;

    app.innerHTML =
      '<h1 id="title" tabindex="-1">你的政治光譜</h1>' +
      '<section class="hero-res" aria-labelledby="bglabel"><span class="muted">藍綠位置（綜合指數 ' + fmt(r.bg) + '）</span>' +
      '<p class="res-label" id="bglabel">' + esc(bgLabel(r.bg, r.cross)) + "</p><p>" + esc(bgDesc(r.bg, r.cross)) + "</p>" +
      bgMeterHtml(r) +
      (tags.length ? '<p style="margin-top:16px"><b>你的組合：</b>' + esc(tags.join("、")) + "</p>" : "") + notes + "</section>" +
      '<div class="actions"><button class="btn primary" type="button" data-act="png">下載結果圖片</button><button class="btn" type="button" data-act="copy">複製結果文字</button><button class="btn ghost" type="button" data-act="review">回去修改答案</button></div>' +
      '<h2>12 個面向的雷達圖</h2><div class="card radar">' + radarSVG(r) + '<p class="muted" style="text-align:center">圓心 −100、最外圈 +100、中間粗線為 0；每個面向的正方向見下方各軸右側描述。</p></div>' +
      "<h2>各面向分數與解讀</h2><div class=\"card\">" + D.axisOrder.map(function (k) { return axisRow(k, r, true); }).join("") + "</div>" + sqHtml +
      refHtml +
      '<h2>與各政黨概括位置的接近度</h2><div class="card">' + partyHtml +
      '<p class="muted" style="margin-top:10px">接近度 = 100 − 各面向分數與政黨估計值的平均差距 ÷ 2，只用你有效作答的面向。政黨位置是依政綱與公開資料的估計，依據與來源見' +
      ' <button class="btn ghost" style="padding:0;min-height:0" type="button" data-go="method">方法與限制</button>。這只是參考，不代表你應該支持誰。</p></div>' +
      '<h2>其他現成測驗</h2>' + testsBlock() +
      '<div class="actions"><button class="btn" type="button" data-act="restart">清除並重新作答</button></div>';
  }

  /* ---------- 方法與限制 ---------- */
  function renderMethod() {
    var counts = D.axisOrder.concat(["sq"]).map(function (k) {
      var it = D.Q.filter(function (q) { return q.d === k; });
      var pos = it.filter(function (q) { return q.s > 0; }).length;
      return "<tr><td>" + esc(dimBy[k].n) + "</td><td>" + it.length + "</td><td>" + pos + "／" + (it.length - pos) + "</td><td>" + esc(dimBy[k].neg) + " ↔ " + esc(dimBy[k].pos) + "</td></tr>";
    }).join("");
    var wt = Object.keys(D.bgWeights).map(function (k) { return "<tr><td>" + esc(dimBy[k].n) + "</td><td>" + Math.round(D.bgWeights[k] * 100) + "%</td></tr>"; }).join("");
    var head = "<tr><th>政黨</th>" + D.axisOrder.map(function (k) { return "<th>" + esc(dimBy[k].n.slice(0, 2)) + "</th>"; }).join("") + "</tr>";
    var rows = D.parties.map(function (p) { return "<tr><td>" + esc(p.n) + "</td>" + p.v.map(function (x) { return "<td>" + x + "</td>"; }).join("") + "</tr>"; }).join("");
    var psrc = D.parties.map(function (p) {
      return "<details><summary>" + esc(p.n) + '</summary><p class="muted">' + esc(p.desc) + '</p><ul class="plain">' + p.src.map(function (s) { return "<li>" + ext(s.u, s.t) + "</li>"; }).join("") + "</ul></details>";
    }).join("");
    app.innerHTML =
      '<h1 id="title" tabindex="-1">方法與限制</h1>' +
      '<p class="lede">這份問卷是自編的公民教育工具，不是經過學術信效度驗證的量表。以下說明題目怎麼設計、分數怎麼算，以及它不能告訴你什麼。</p>' +
      "<h2>限制</h2><div class=\"card\"><ul class=\"plain\">" +
        "<li>未經學術驗證：題目沒有經過預試、因素分析或信度檢驗，各面向的分界是編者的判斷。</li>" +
        "<li>政黨位置是估計：依政綱、立法與公開報導概括估計，不是政黨填答；政黨立場會隨時間、領導人與議題變動，黨內也有不同聲音。</li>" +
        "<li>結果不是標籤：同一個分數背後可能有很不同的理由。請把結果當成自我整理的起點，而不是身分判定。</li>" +
        "<li>題目選擇會影響結果：放哪些議題、放多少題，都會改變分數與政黨接近度。</li>" +
      "</ul></div>" +
      "<h2>題目設計原則</h2><div class=\"card\"><ul class=\"plain\">" +
        "<li>每題只問一件事；避免情緒字眼、政黨標籤與誘導；儘量用原則性描述，少用很快過時的時事。</li>" +
        "<li>每個面向的正向題與反向題數量相同，降低「一律同意」的默許偏差。</li>" +
        "<li>每題只歸入一個面向，避免同一題同時影響兩個分數。</li>" +
        "<li>國家認同與統獨面向區分三個層次：<b>身分認同</b>（台灣人／中國人）、<b>未來政治安排偏好</b>（獨立／統一，含吳乃德提出、TEDS 採用的條件式題目），以及<b>現狀維持傾向</b>（單獨成指標，不併入統獨分數，因為「維持現狀」可能偏統、偏獨或都不偏）。另附兩道沿用政大選研中心長期測量方式的參照題（台灣人／中國人認同、統獨六分類），不計分，只與全台民調對照。</li>" +
      "</ul></div>" +
      '<h2>各面向題數</h2><div class="card table-scroll"><table><tr><th>面向</th><th>題數</th><th>正／反向</th><th>−100 ↔ +100</th></tr>' + counts + "</table></div>" +
      "<h2>計分規則</h2><div class=\"card\"><ul class=\"plain\">" +
        "<li>非常同意 +2、同意 +1、中立 0、不同意 −1、非常不同意 −2；反向題乘以 −1。</li>" +
        "<li>面向分數 = 有效作答的加總 ÷（有效題數 × 2）× 100，範圍 −100 到 +100。</li>" +
        "<li>「不確定／沒有意見」不計入分子也不計入分母。某面向有效題數少於題數的一半，標示「可信度低」；完全沒有有效作答則顯示資料不足。</li>" +
        "<li>分數絕對值小於 20 為居中，20–54 為偏向，55 以上為明顯偏向。</li>" +
      "</ul></div>" +
      '<h2>藍綠位置怎麼算</h2><div class="card"><p>台灣政黨競爭的主軸是國家認同與兩岸關係，而非經濟左右。藍綠綜合指數只對下面三個核心面向加權平均（某面向資料不足時，其餘權重等比例放大；有效權重合計不到 50% 則不計算）：</p><div class="table-scroll"><table><tr><th>面向</th><th>權重</th></tr>' + wt + "</table></div>" +
        "<p>「國防與外交」不折進這個指數，只在各面向裡單獨呈現。反對擴軍、傾向和平或避險，並不等於泛藍；支持強化國防與同盟，也不必然等於泛綠。</p>" +
        "<p>分級：+55 以上深綠、+20 到 +54 淺綠、−19 到 +19 中間、−20 到 −54 淺藍、−55 以下深藍。若三個核心面向彼此拉向不同方向（最高分至少 +20 且最低分在 −10 以下，或最高分至少 +10 且最低分在 −20 以下，或高低分差達到 55），就標成「立場交錯」。落在中間帶時再寫成「中間偏綠 · 立場交錯」（+10 到 +19）、「中間偏藍 · 立場交錯」（−19 到 −10）或「中間 · 立場交錯」（−9 到 +9）。這表示加權位置是互相拉扯後的折衷，不是三個面向都居中。色帶上的圓點是加權指數，短線是認同、兩岸、轉正各自的位置。</p>" +
        "<p>經濟、社會、環境、核能、民主參與、居住與世代等面向不納入藍綠指數，而是以「組合」另外呈現，因為各陣營內部在這些議題上差異很大。</p></div>" +
      "<h2>一致性檢查</h2><div class=\"card\"><p>問卷中埋了 " + D.pairs.length + " 組內容相近、方向相反的配對題（例如「維持公營」與「開放民營化」）。兩題都有明確表態時，若答案方向互相矛盾，就記為一組不一致。另外也檢查是否超過 85% 的非中立答案都落在同一邊（默許傾向）。這些提示只是提醒，不會更改分數。</p></div>" +
      '<h2>政黨位置估計與依據</h2><div class="card"><p class="muted">數值為編者依下列公開資料所做的估計（−100 到 +100，方向同各面向），不是政黨官方答案。</p><div class="table-scroll"><table>' + head + rows + "</table></div>" + psrc + "</div>" +
      "<h2>參考來源</h2><div class=\"card\"><ul class=\"plain\">" + D.methodSources.map(function (s) { return "<li>" + ext(s.u, s.t) + "</li>"; }).join("") + "</ul></div>" +
      '<h2>其他現成測驗</h2>' + testsBlock();
  }

  /* ---------- 分享 ---------- */
  function resultText() {
    var r = compute();
    var lines = ["台灣人的政治光譜｜我的結果", "藍綠位置：" + bgLabel(r.bg, r.cross) + (r.bg === null ? "" : "（" + fmt(r.bg) + "）")];
    pullLines(r.core).forEach(function (ln) { lines.push(ln.text); });
    var t = comboTags(r); if (t.length) lines.push("組合：" + t.join("、"));
    lines.push("");
    D.axisOrder.forEach(function (k) { var a = r.axes[k], d = dimBy[k]; lines.push(d.n + "：" + (a.score === null ? "資料不足" : fmt(a.score) + "（" + axisWord(a.score, d) + "）") + (a.low ? "［可信度低］" : "")); });
    if (r.parties.length) { lines.push(""); lines.push("政黨接近度：" + r.parties.slice(0, 3).map(function (x) { return x.p.n + " " + x.sim + "%"; }).join("、")); }
    lines.push(""); lines.push("（自編問卷，非學術量表；分數為 −100 到 +100）");
    return lines.join("\n");
  }
  function copyText() {
    var txt = resultText();
    function fallback() { var ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("已複製結果文字"); } catch (e) { toast("無法自動複製，請手動選取"); } ta.remove(); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(function () { toast("已複製結果文字"); }, fallback); else fallback();
  }
  function drawPNG() {
    var r = compute(), W = 1080, c = document.createElement("canvas"); c.width = W; c.height = 1900;
    var g = c.getContext("2d"), F = getComputedStyle(document.body).fontFamily;
    g.fillStyle = "#f7f7f5"; g.fillRect(0, 0, W, c.height);
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillStyle = "#18181b"; g.font = "700 60px " + F; g.fillText("台灣人的政治光譜", 72, 120);
    g.fillStyle = "#6b6b74"; g.font = "400 30px " + F; g.fillText("藍綠位置（綜合指數 " + fmt(r.bg) + "）", 72, 185);
    var label = bgLabel(r.bg, r.cross);
    g.fillStyle = "#18181b"; g.font = "700 64px " + F;
    if (g.measureText(label).width > W - 144) g.font = "700 46px " + F;
    g.fillText(label, 72, 268);
    var mx = 72, mw = W - 144, my = 320, mh = 18;
    var grad = g.createLinearGradient(mx, 0, mx + mw, 0);
    grad.addColorStop(0, "#1d4ed8"); grad.addColorStop(0.5, "#8a8a93"); grad.addColorStop(1, "#15803d");
    g.fillStyle = grad; roundRect(g, mx, my, mw, mh, 9); g.fill();
    (r.core || []).forEach(function (x) {
      if (x.score === null) return;
      var tx = mx + mw * (x.score + 100) / 200;
      g.strokeStyle = "#ffffff"; g.lineWidth = 6; g.lineCap = "butt";
      g.beginPath(); g.moveTo(tx, my - 11); g.lineTo(tx, my + mh + 11); g.stroke();
      g.strokeStyle = "#18181b"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(tx, my - 11); g.lineTo(tx, my + mh + 11); g.stroke();
    });
    if (r.bg !== null) {
      var px = mx + mw * (r.bg + 100) / 200;
      g.beginPath(); g.arc(px, my + mh / 2, 16, 0, Math.PI * 2);
      g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 5; g.strokeStyle = "#18181b"; g.stroke();
    }
    g.fillStyle = "#6b6b74"; g.font = "400 24px " + F;
    g.textAlign = "left"; g.fillText("深藍 −100", mx, my + mh + 44);
    g.textAlign = "center"; g.fillText("中間", mx + mw / 2, my + mh + 44);
    g.textAlign = "right"; g.fillText("+100 深綠", mx + mw, my + mh + 44);
    g.textAlign = "left";
    var y = my + mh + 92;
    g.font = "500 28px " + F;
    pullLines(r.core).forEach(function (ln) { g.fillStyle = ln.color; y = wrapY(g, ln.text, 72, y, W - 144, 40); y += 4; });
    y += 6;
    g.fillStyle = "#6b6b74"; g.font = "400 22px " + F;
    y = wrapY(g, "圓點是加權指數，短線是認同、兩岸、轉正各自的位置。", 72, y, W - 144, 32);
    var tags = comboTags(r).join("、");
    if (tags) { y += 16; g.fillStyle = "#4a4a52"; g.font = "400 28px " + F; y = wrapY(g, tags, 72, y, W - 144, 40); }
    y += 34;
    D.axisOrder.forEach(function (k) {
      var a = r.axes[k], d = dimBy[k];
      g.fillStyle = "#18181b"; g.font = "600 28px " + F; g.textAlign = "left"; g.fillText(d.n, 72, y);
      g.textAlign = "right"; g.fillStyle = "#4a4a52"; g.font = "400 26px " + F;
      g.fillText(a.score === null ? "資料不足" : fmt(a.score), W - 72, y); g.textAlign = "left";
      var tx = 72, tw = W - 144, ty = y + 16;
      g.fillStyle = "#e6e6e1"; roundRect(g, tx, ty, tw, 14, 7); g.fill();
      if (a.score !== null && a.score !== 0) { var half = tw / 2, w = half * Math.abs(a.score) / 100; g.fillStyle = "#4f46e5"; roundRect(g, a.score >= 0 ? tx + half : tx + half - w, ty, Math.max(w, 2), 14, 7); g.fill(); }
      g.fillStyle = "#9a9aa3"; g.fillRect(tx + tw / 2 - 1, ty - 5, 2, 24);
      y += 64;
    });
    y += 24;
    g.fillStyle = "#6b6b74"; g.font = "400 22px " + F;
    y = wrapY(g, "各軸 −100 到 +100；右側為：台灣認同、防衛、強化國防、重分配、國家主導、環保優先、非核、自由進步、積極轉正、多元保障、直接參與、居住改革。自編問卷，非學術量表。", 72, y, W - 144, 32);
    var outH = Math.ceil(y + 28);
    var out = document.createElement("canvas"); out.width = W; out.height = outH;
    out.getContext("2d").drawImage(c, 0, 0, W, outH, 0, 0, W, outH);
    out.toBlob(function (b) {
      if (!b) { toast("無法產生圖片"); return; }
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "台灣人的政治光譜-結果.png"; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast("已下載結果圖片");
    }, "image/png");
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function wrapY(g, text, x, y, maxW, lh) { var line = ""; for (var i = 0; i < text.length; i++) { var test = line + text[i]; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = text[i]; y += lh; } else line = test; } if (line) { g.fillText(line, x, y); y += lh; } return y; }

  /* ---------- 事件 ---------- */
  function render() {
    nav();
    if (view === "quiz") renderQuiz(); else if (view === "result") renderResult(); else if (view === "method") renderMethod(); else renderStart();
    if (view !== "quiz") { var t = document.getElementById("title"); if (t) t.focus({ preventScroll: true }); }
    document.title = (view === "result" ? "結果｜" : view === "method" ? "方法與限制｜" : "") + "台灣人的政治光譜";
  }
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-go],[data-act],.opt");
    if (!el) return;
    if (el.classList.contains("opt")) { pick(el.getAttribute("data-val")); return; }
    var go = el.getAttribute("data-go"); if (go) { setView(go); return; }
    var act = el.getAttribute("data-act");
    if (act === "begin") { state.pos = 0; save(); setView("quiz"); }
    else if (act === "resume") { var j = seq.findIndex(function (x) { return itemAnswer(x) === undefined; }); state.pos = j < 0 ? state.pos : j; save(); setView("quiz"); }
    else if (act === "restart") { if (answeredCount() === 0 || confirm("確定要清除所有作答並重新開始？")) { clearAll(); setView("quiz"); } }
    else if (act === "review") { state.pos = 0; save(); setView("quiz"); }
    else if (act === "prev") { if (state.pos > 0) { state.pos--; save(); renderQuiz(); } }
    else if (act === "next") { if (state.pos < seq.length - 1) { state.pos++; save(); renderQuiz(); } }
    else if (act === "copy") copyText();
    else if (act === "png") drawPNG();
  });
  document.addEventListener("keydown", function (e) {
    if (view !== "quiz" || e.altKey || e.ctrlKey || e.metaKey) return;
    var it = currentItem(), k = e.key;
    var opts = Array.prototype.slice.call(document.querySelectorAll(".opt"));
    if (/^[0-9]$/.test(k)) {
      var n = Number(k);
      if (it.type === "ref") { if (n >= 1 && n <= opts.length) { e.preventDefault(); pick(String(n - 1)); } }
      else if (n === 0) { e.preventDefault(); pick("u"); }
      else if (n <= 5) { e.preventDefault(); pick(String(LIKERT[n - 1][1])); }
    } else if (k === "u" || k === "U") { if (it.type === "q") { e.preventDefault(); pick("u"); } }
    else if (k === "ArrowLeft" || (k === "Backspace" && document.activeElement.tagName !== "INPUT")) { if (state.pos > 0) { e.preventDefault(); state.pos--; save(); renderQuiz(); } }
    else if (k === "ArrowRight") { if (itemAnswer(it) !== undefined && state.pos < seq.length - 1) { e.preventDefault(); state.pos++; save(); renderQuiz(); } }
    else if ((k === "ArrowDown" || k === "ArrowUp") && document.activeElement.classList.contains("opt")) {
      e.preventDefault(); var i = opts.indexOf(document.activeElement); var nx = opts[(i + (k === "ArrowDown" ? 1 : -1) + opts.length) % opts.length];
      opts.forEach(function (o) { o.tabIndex = -1; }); nx.tabIndex = 0; nx.focus();
    }
  });

  window.__TWPS = { state: function () { return state; }, setState: function (s) { state = s; save(); }, compute: compute, setView: setView, seq: seq, resultText: resultText };
  render();
})();
