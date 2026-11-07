// Painel do professor - só é carregado depois da senha. Usa as funções do index.html.

window.telaProfessor = function () {
  const corpo = cabecalho("Professor");
  corpo.appendChild(criarBotao('<span class="rotulo">›</span>Configurar quizzes', profListaQuizzes));
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

async function profConfigQuiz(nome, cfgEmEdicao) {
  const corpo = cabecalho("Config: " + nome);
  const cfg = cfgEmEdicao || await carregarConfigQuiz(nome);

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
  ciclo("Modo", "modo", ["normal", "arriscar"], v => v === "normal" ? "Normal" : "Arriscar (pode pular)");
  if (cfg.modo === "normal") {
    ciclo("Pontuação", "pontuacao", ["dez", "pontos"], v => v === "dez" ? "Nota de 0 a 10" : "1 ponto por questão");
  }
  ciclo("Tempo por questão", "tempo", [0, 15, 30, 45, 60, 90, 120], v => v ? v + "s" : "Livre");
  if (cfg.modo === "arriscar") {
    ciclo("Pontos por acerto", "ganho", [0.5, 1, 2, 5], v => "+" + v);
    ciclo("Pontos por erro", "perda", [0, 0.5, 1, 2, 5], v => "-" + v);
    ciclo("Meta para terminar", "meta", [5, 10, 15, 20, 30, 50], v => v + " pontos");
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
