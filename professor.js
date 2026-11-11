// Painel do professor - só é carregado depois da senha. Usa as funções do index.html.

window.telaProfessor = function () {
  const corpo = cabecalho("Professor");
  corpo.appendChild(criarBotao('<span class="rotulo">›</span>Configurar quizzes', profListaQuizzes));
  corpo.appendChild(criarBotao('<span class="rotulo">›</span>Acompanhar turma', profEscolherTurma));
  corpo.appendChild(criarBotao('<span class="rotulo">›</span>Gerar planilha', profEscolherTurmaPlanilha));
  corpo.appendChild(criarBotao("Sair do painel", telaLogin));
  const versao = document.createElement("p");
  versao.className = "rodape-dica";
  versao.textContent = "painel v4 (etapas 1 a 4)";
  corpo.appendChild(versao);
};

async function profListaQuizzes() {
  const corpo = cabecalho("Configurar quizzes");
  let arquivos = [];
  try {
    arquivos = await buscarLista("perguntas/lista.txt");
  } catch (e) {
    await digitarParagrafo(corpo, "Não encontrei perguntas/lista.txt.", "erro-texto");
  }
  for (const arquivo of arquivos) {
    const nome = arquivo.replace(".txt", "");
    corpo.appendChild(criarBotao('<span class="rotulo">›</span>' + nome, () => profConfigQuiz(nome, null)));
  }
  corpo.appendChild(criarBotao("Voltar", window.telaProfessor));
}

const contagemQuestoes = {};

async function profConfigQuiz(nome, cfgEmEdicao) {
  const corpo = cabecalho("Config: " + nome);
  const cfg = cfgEmEdicao || await carregarConfigQuiz(nome);

  if (contagemQuestoes[nome] === undefined) {
    try { contagemQuestoes[nome] = carregarQuestoes(await buscarTexto("perguntas/" + nome + ".txt")).length; }
    catch (e) { contagemQuestoes[nome] = null; }
  }
  const n = contagemQuestoes[nome];

  const ciclo = (rotulo, campo, valores, formatar) => {
    corpo.appendChild(criarBotao(
      '<span class="rotulo">›</span>' + rotulo + ": " + formatar(cfg[campo]),
      () => {
        const i = valores.indexOf(cfg[campo]);
        cfg[campo] = valores[(i + 1) % valores.length];
        profConfigQuiz(nome, cfg);
      }
    ));
  };

  ciclo("Ordem das questões", "ordem", ["aleatoria", "sequencial"], v => v === "aleatoria" ? "Aleatória" : "Sequencial");
  ciclo("Modo", "modo", ["normal", "desafio"], v => v === "normal" ? "Normal" : "Desafio (pode pular)");
  if (cfg.modo === "normal") {
    ciclo("Pontuação", "pontuacao", ["dez", "pontos"], v => v === "dez" ? "Nota de 0 a 10" : "1 ponto por questão");
  }
  ciclo("Tempo por questão", "tempo", [0, 15, 30, 45, 60, 90, 120], v => v ? v + "s" : "Livre");
  if (cfg.modo === "desafio") {
    ciclo("Pontos por acerto", "ganho", [0.5, 1, 2, 5], v => "+" + v);
    ciclo("Pontos por erro", "perda", [0, 0.5, 1, 2, 5], v => "-" + v);
    ciclo("Meta para terminar", "meta", [5, 10, 15, 20, 25, 30, 50], v => v + " pontos");
    if (n) {
      const precisa = Math.ceil(cfg.meta / cfg.ganho);
      const info = document.createElement("p");
      info.className = precisa > n ? "erro-texto" : "destaque-texto";
      info.textContent = precisa > n
        ? `ATENÇÃO: o quiz tem ${n} questões e a meta exige ${precisa} acertos. Não dá para atingir.`
        : `O quiz tem ${n} questões; a meta exige ${precisa} acertos (${Math.round(precisa / n * 100)}% das questões).`;
      corpo.appendChild(info);
    }
  }

  const aviso = document.createElement("p");
  aviso.className = "rodape-dica";
  corpo.appendChild(aviso);

  corpo.appendChild(criarBotao("Salvar", async () => {
    if (!window.firebasePronto) { aviso.textContent = "Firebase não está pronto."; return; }
    try {
      await window.firestoreSetDoc(window.firestoreDoc(window.firestoreDB, "configuracoes", nome), cfg);
      aviso.textContent = "Configuração salva.";
    } catch (e) {
      console.error(e);
      aviso.textContent = "Não foi possível salvar.";
    }
  }));
  corpo.appendChild(criarBotao("Voltar", profListaQuizzes));
}


// ===== ACOMPANHAR TURMA AO VIVO + CONTROLES =====

let PROF_FS_URL = "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
let profParar = null;

function profEstadoAluno(s, agora) {
  if (!s) return { quiz: "—", acao: "offline", pontos: "—", cor: "var(--linha)" };
  const quiz = s.quizAtual || "—";
  const pontos = s.pontos !== undefined ? fmt(s.pontos) : "—";
  if (s.bloqueado) return { quiz, acao: "bloqueado", pontos, cor: "var(--erro)" };
  const parado = !s.ativo || !s.ultimoPing || (agora - new Date(s.ultimoPing).getTime()) > 60000;
  if (parado) return { quiz, acao: "offline", pontos, cor: "var(--linha)" };
  if (!s.acao) return { quiz: "—", acao: "no menu", pontos: "—", cor: "var(--texto)" };
  const cores = { lendo: "var(--texto)", acertou: "var(--destaque)", errou: "var(--erro)", pulou: "#ffb000", tempo: "#ffb000", terminou: "var(--destaque)" };
  const nomes = { tempo: "tempo esgotado" };
  return { quiz, acao: nomes[s.acao] || s.acao, pontos, cor: cores[s.acao] || "var(--texto)" };
}

function profInjetarEstilo() {
  if (document.getElementById("estilo-prof")) return;
  const s = document.createElement("style");
  s.id = "estilo-prof";
  s.textContent = ".tab-prof{width:100%;border-collapse:collapse;font-size:12px}.tab-prof th,.tab-prof td{text-align:left;padding:6px 4px;border-bottom:1px solid var(--linha)}.tab-prof th{color:var(--destaque);font-weight:normal}.tab-wrap{overflow-x:auto}.tab-prof tr.lin-aluno td{border-bottom:none;padding-bottom:2px}.acoes-prof{padding:2px 4px 10px!important}.mini-prof{background:var(--fundo-caixa);border:1px solid var(--linha);color:var(--texto);font-family:inherit;font-size:13px;padding:6px 12px;margin-right:6px;cursor:pointer}";
  document.head.appendChild(s);
}

function profMiniBotao(texto, aoClicar) {
  const b = document.createElement("button");
  b.className = "mini-prof";
  b.textContent = texto;
  b.onclick = (ev) => { ev.stopPropagation(); aoClicar(); };
  return b;
}

async function profEscolherTurma() {
  if (profParar) { profParar(); profParar = null; }
  const corpo = cabecalho("Acompanhar turma");
  const turmas = (await carregarTurmasCache()).filter(t => t.arquivo);
  if (!turmas.length) await digitarParagrafo(corpo, "Nenhuma turma com lista de alunos em turmas.txt.", "erro-texto");
  for (const t of turmas) corpo.appendChild(criarBotao('<span class="rotulo">›</span>' + t.titulo, () => profAcompanhar(t)));
  corpo.appendChild(criarBotao("Voltar", window.telaProfessor));
}

async function profAcompanhar(turma) {
  profInjetarEstilo();
  const corpo = cabecalho(turma.titulo);
  if (!window.firebasePronto) {
    await digitarParagrafo(corpo, "Firebase não está pronto.", "erro-texto");
    corpo.appendChild(criarBotao("Voltar", profEscolherTurma));
    return;
  }
  const fs = await import(PROF_FS_URL);
  const db = window.firestoreDB;
  const roster = await carregarRoster(turma.arquivo);

  const resumo = document.createElement("p");
  resumo.className = "destaque-texto";
  corpo.appendChild(resumo);
  const wrap = document.createElement("div");
  wrap.className = "tab-wrap";
  const tabela = document.createElement("table");
  tabela.className = "tab-prof";
  wrap.appendChild(tabela);
  corpo.appendChild(wrap);

  const cab = document.createElement("tr");
  for (const t of ["Aluno", "Quiz", "Ação", "Nota"]) { const th = document.createElement("th"); th.textContent = t; cab.appendChild(th); }
  tabela.appendChild(cab);

  let cache = {};
  const linhas = roster.map(aluno => {
    const id = idSessao(aluno.nome);
    const tr = document.createElement("tr");
    tr.className = "lin-aluno";
    const cel = [0, 1, 2, 3].map(() => { const td = document.createElement("td"); tr.appendChild(td); return td; });
    cel[0].textContent = aluno.nome;
    const btnBloq = profMiniBotao("Bloquear", () => {
      const s = cache[id];
      fs.setDoc(fs.doc(db, "sessoes", id), { bloqueado: !(s && s.bloqueado) }, { merge: true }).catch(() => {});
    });
    const trAcoes = document.createElement("tr");
    const tdAcoes = document.createElement("td");
    tdAcoes.colSpan = 4;
    tdAcoes.className = "acoes-prof";
    tdAcoes.appendChild(btnBloq);
    tdAcoes.appendChild(profMiniBotao("Resultados", () => profResultadosAluno(turma, aluno)));
    trAcoes.appendChild(tdAcoes);
    tabela.appendChild(tr);
    tabela.appendChild(trAcoes);
    return { id, cel, btnBloq };
  });

  const atualizar = () => {
    const agora = Date.now();
    let online = 0, terminaram = 0;
    for (const l of linhas) {
      const s = cache[l.id];
      const e = profEstadoAluno(s, agora);
      if (e.acao !== "offline" && e.acao !== "bloqueado") online++;
      if (e.acao === "terminou") terminaram++;
      l.cel[1].textContent = e.quiz;
      l.cel[2].textContent = e.acao;
      l.cel[3].textContent = e.pontos;
      l.cel[2].style.color = e.cor;
      l.cel[3].style.color = e.cor;
      l.btnBloq.textContent = (s && s.bloqueado) ? "Liberar" : "Bloquear";
    }
    resumo.textContent = "Online: " + online + " de " + roster.length + " | Terminaram: " + terminaram;
  };
  atualizar();

  const cancelar = fs.onSnapshot(fs.collection(db, "sessoes"),
    (snap) => { cache = {}; snap.forEach(d => { cache[d.id] = d.data(); }); atualizar(); },
    () => { resumo.textContent = "Erro ao ouvir o Firebase."; });
  const relogio = setInterval(atualizar, 5000);
  profParar = () => { cancelar(); clearInterval(relogio); };

  corpo.appendChild(criarBotao("Voltar", () => { profParar(); profParar = null; profEscolherTurma(); }));
}

async function profResultadosAluno(turma, aluno) {
  if (profParar) { profParar(); profParar = null; }
  const corpo = cabecalho(aluno.nome);
  const fs = await import(PROF_FS_URL);
  const docs = [];
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(window.firestoreDB, "resultados"), fs.where("aluno", "==", aluno.nome)));
    snap.forEach(d => docs.push(d));
  } catch (e) {
    await digitarParagrafo(corpo, "Erro ao ler os resultados.", "erro-texto");
  }
  if (!docs.length) await digitarParagrafo(corpo, "Nenhum resultado registrado.");
  for (const d of docs) {
    const r = d.data();
    const rotulo = r.quiz + " — nota " + fmt(r.nota);
    let pendente = false;
    const b = criarBotao("", async () => {
      if (!pendente) { pendente = true; b.textContent = "Toque de novo para APAGAR: " + rotulo; return; }
      await fs.deleteDoc(d.ref);
      profResultadosAluno(turma, aluno);
    }, false, { semSom: true });
    b.textContent = "Apagar: " + rotulo;
    corpo.appendChild(b);
  }
  corpo.appendChild(criarBotao("Voltar", () => profAcompanhar(turma)));
}


// ===== ETAPA 4: PLANILHA (.xlsx) =====

const PROF_CORES = {
  ok: "FFE2F0D9", erro: "FFFADBD8", gabarito: "FFFFF2CC", media: "FFD9EAD3",
  adequado: "FF1B5E20", intermediario: "FFA9D18E", critico: "FFFFD966", muito_critico: "FFFF0000",
};
const PROF_FAIXAS = [["adequado", "Adequado (75% ou mais)"], ["intermediario", "Intermediário (50 a 75%)"], ["critico", "Crítico (25 a 50%)"], ["muito_critico", "Muito crítico (abaixo de 25%)"]];

function profFaixa(p) { return p >= 75 ? "adequado" : p >= 50 ? "intermediario" : p >= 25 ? "critico" : "muito_critico"; }

function profMontarPlanilha(roster, docs, quiz, turma) {
  const gabarito = docs[0].gabarito || [];
  const n = gabarito.length;
  const porNome = {};
  docs.forEach(d => { porNome[d.aluno] = d; });
  const nomes = roster.map(a => a.nome);
  docs.forEach(d => { if (!nomes.includes(d.aluno)) nomes.push(d.aluno); });

  const cfg0 = Object.assign({ modo: "normal", pontuacao: "dez", ganho: 1, perda: 1, meta: 10 }, docs[0].config || {});
  const rotuloNota = (cfg0.modo === "desafio" || cfg0.pontuacao === "pontos") ? "Pontos" : "Nota";

  const linhas = [];
  const certos = new Array(n).fill(0), validos = new Array(n).fill(0);
  const contagemFaixas = { adequado: 0, intermediario: 0, critico: 0, muito_critico: 0 };
  let somaNotas = 0, respondentes = 0;

  for (const nome of nomes) {
    const d = porNome[nome];
    if (!d) { linhas.push({ nome, feito: false }); continue; }
    const cfg = Object.assign({}, cfg0, d.config || {});
    const desafio = cfg.modo === "desafio";
    const resp = d.respostas || [];
    const estados = [], celulas = [];
    let acertos = 0, erros = 0;
    for (let i = 0; i < n; i++) {
      const r = resp[i] === undefined ? "-" : resp[i];
      celulas.push(r);
      let est = "branco";
      const letra = /^[A-E]$/.test(r);
      if (letra) est = r === gabarito[i] ? "ok" : "erro";
      else if (r === "T" && !desafio) est = "erro";
      estados.push(est);
      if (est === "ok") acertos++;
      if (est === "erro" && letra) erros++;
      if (est !== "branco") { validos[i]++; if (est === "ok") certos[i]++; }
    }
    let pontos, percentual;
    if (desafio) { pontos = acertos * cfg.ganho - erros * cfg.perda; percentual = cfg.meta > 0 ? Math.max(0, pontos) / cfg.meta * 100 : 0; }
    else if (cfg.pontuacao === "pontos") { pontos = acertos; percentual = n ? acertos / n * 100 : 0; }
    else { pontos = n ? acertos * 10 / n : 0; percentual = pontos * 10; }
    pontos = Math.round(pontos * 100) / 100;
    const faixa = profFaixa(percentual);
    contagemFaixas[faixa]++;
    somaNotas += pontos;
    respondentes++;
    linhas.push({ nome, feito: true, celulas, estados, acertos, pontos, faixa });
  }
  const percentuais = certos.map((c, i) => validos[i] ? Math.round(c / validos[i] * 1000) / 10 : null);
  const media = respondentes ? Math.round(somaNotas / respondentes * 100) / 100 : null;
  return { titulo: quiz + " - " + turma, n, gabarito, rotuloNota, linhas, percentuais, media, contagemFaixas, respondentes };
}

function profCarregarExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  const urls = ["https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js", "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"];
  return new Promise((resolve, reject) => {
    const tentar = (i) => {
      if (i >= urls.length) { reject(new Error("biblioteca de planilha indisponível")); return; }
      const s = document.createElement("script");
      s.src = urls[i];
      s.onload = () => (window.ExcelJS ? resolve() : tentar(i + 1));
      s.onerror = () => tentar(i + 1);
      document.head.appendChild(s);
    };
    tentar(0);
  });
}

async function profBaixarPlanilha(plan) {
  await profCarregarExcelJS();
  const wb = new window.ExcelJS.Workbook();
  const ws = wb.addWorksheet(plan.titulo.replace(/[:\\\/?*\[\]]/g, "-").slice(0, 31));
  const pintar = (cel, argb) => { cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }; };
  const claro = (faixa) => (faixa === "adequado" || faixa === "muito_critico") ? "FFFFFFFF" : "FF000000";
  const n = plan.n;

  ws.addRow(["Aluno"].concat(Array.from({ length: n }, (_, i) => "Q" + (i + 1))).concat(["Acertos", plan.rotuloNota])).font = { bold: true };
  const gab = ws.addRow(["GABARITO"].concat(plan.gabarito).concat(["", ""]));
  gab.font = { bold: true };
  gab.eachCell(c => pintar(c, PROF_CORES.gabarito));

  for (const l of plan.linhas) {
    if (!l.feito) { ws.addRow([l.nome].concat(new Array(n).fill("-")).concat(["-", "-"])); continue; }
    const row = ws.addRow([l.nome].concat(l.celulas).concat([l.acertos, l.pontos]));
    l.estados.forEach((est, i) => { if (est === "ok" || est === "erro") pintar(row.getCell(2 + i), PROF_CORES[est]); });
    const cn = row.getCell(3 + n);
    pintar(cn, PROF_CORES[l.faixa]);
    cn.font = { bold: true, color: { argb: claro(l.faixa) } };
  }

  ws.addRow(["% Acertos"].concat(plan.percentuais.map(p => p === null ? "-" : p + "%")).concat(["", ""])).font = { bold: true };
  const rm = ws.addRow(["Média da turma", plan.media === null ? "-" : plan.media]);
  rm.font = { bold: true };
  rm.eachCell(c => pintar(c, PROF_CORES.media));
  ws.addRow([]);
  for (const [chave, rotulo] of PROF_FAIXAS) {
    const r = ws.addRow([rotulo, plan.contagemFaixas[chave]]);
    pintar(r.getCell(1), PROF_CORES[chave]);
    r.getCell(1).font = { bold: true, color: { argb: claro(chave) } };
  }
  ws.getColumn(1).width = 30;
  for (let i = 2; i <= n + 3; i++) ws.getColumn(i).width = 8;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = plan.titulo.replace(/[\\\/:*?"<>|]/g, "-") + ".xlsx";
  document.body.appendChild(a);
  a.click();
  if (a.remove) a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function profEscolherTurmaPlanilha() {
  const corpo = cabecalho("Gerar planilha");
  const turmas = (await carregarTurmasCache()).filter(t => t.arquivo);
  if (!turmas.length) await digitarParagrafo(corpo, "Nenhuma turma com lista de alunos em turmas.txt.", "erro-texto");
  for (const t of turmas) corpo.appendChild(criarBotao('<span class="rotulo">›</span>' + t.titulo, () => profEscolherQuizPlanilha(t)));
  corpo.appendChild(criarBotao("Voltar", window.telaProfessor));
}

async function profEscolherQuizPlanilha(turma) {
  const corpo = cabecalho(turma.titulo);
  let arquivos = [];
  try { arquivos = await buscarLista("perguntas/lista.txt"); } catch (e) {}
  for (const arq of arquivos) {
    const nome = arq.replace(".txt", "");
    corpo.appendChild(criarBotao('<span class="rotulo">›</span>' + nome, () => profGerarPlanilha(turma, nome)));
  }
  corpo.appendChild(criarBotao("Voltar", profEscolherTurmaPlanilha));
}

async function profGerarPlanilha(turma, quiz) {
  const corpo = cabecalho("Planilha");
  const aviso = document.createElement("p");
  aviso.textContent = "Buscando resultados...";
  corpo.appendChild(aviso);
  try {
    const fs = await import(PROF_FS_URL);
    const snap = await fs.getDocs(fs.query(fs.collection(window.firestoreDB, "resultados"), fs.where("quiz", "==", quiz)));
    const docs = [];
    snap.forEach(d => { const x = d.data(); if (x.turma === turma.titulo) docs.push(x); });
    if (!docs.length) {
      aviso.textContent = "Nenhum aluno desta turma fez este quiz ainda.";
    } else {
      const roster = await carregarRoster(turma.arquivo);
      const plan = profMontarPlanilha(roster, docs, quiz, turma.titulo);
      await profBaixarPlanilha(plan);
      aviso.className = "destaque-texto";
      aviso.textContent = "Planilha gerada: " + plan.titulo + ".xlsx (veja em Downloads). " + plan.respondentes + " de " + roster.length + " alunos já fizeram. Média: " + (plan.media === null ? "-" : fmt(plan.media)) + ".";
    }
  } catch (e) {
    console.error(e);
    aviso.className = "erro-texto";
    aviso.textContent = "Não consegui gerar a planilha. Verifique a internet e tente de novo.";
  }
  corpo.appendChild(criarBotao("Gerar de novo", () => profGerarPlanilha(turma, quiz)));
  corpo.appendChild(criarBotao("Voltar", () => profEscolherQuizPlanilha(turma)));
}
