// Painel do professor - só é carregado depois da senha. Usa as funções do index.html.

window.telaProfessor = function () {
  const corpo = cabecalho("Professor");
  corpo.appendChild(criarBotao('<span class="rotulo">›</span>Configurar quizzes', profListaQuizzes));
  corpo.appendChild(criarBotao('<span class="rotulo">›</span>Acompanhar turma', profEscolherTurma));
  corpo.appendChild(criarBotao("Sair do painel", telaLogin));
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
  s.textContent = ".tab-prof{width:100%;border-collapse:collapse;font-size:12px}.tab-prof th,.tab-prof td{text-align:left;padding:6px 4px;border-bottom:1px solid var(--linha)}.tab-prof th{color:var(--destaque);font-weight:normal}.tab-wrap{overflow-x:auto}.mini-prof{background:var(--fundo-caixa);border:1px solid var(--linha);color:var(--texto);font-family:inherit;font-size:12px;padding:3px 6px;margin-right:4px;cursor:pointer}";
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
  for (const t of ["Aluno", "Quiz", "Ação", "Nota", ""]) { const th = document.createElement("th"); th.textContent = t; cab.appendChild(th); }
  tabela.appendChild(cab);

  let cache = {};
  const linhas = roster.map(aluno => {
    const id = idSessao(aluno.nome);
    const tr = document.createElement("tr");
    const cel = [0, 1, 2, 3, 4].map(() => { const td = document.createElement("td"); tr.appendChild(td); return td; });
    cel[0].textContent = aluno.nome;
    const btnBloq = profMiniBotao("Bloquear", () => {
      const s = cache[id];
      fs.setDoc(fs.doc(db, "sessoes", id), { bloqueado: !(s && s.bloqueado) }, { merge: true }).catch(() => {});
    });
    cel[4].appendChild(btnBloq);
    cel[4].appendChild(profMiniBotao("Resultados", () => profResultadosAluno(turma, aluno)));
    tabela.appendChild(tr);
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
