// Painel do professor - só é carregado depois da senha. Usa as funções do index.html.

window.telaProfessor = function () {
  const corpo = cabecalho("Professor");
  corpo.appendChild(criarBotao('<span class="rotulo">›</span>Configurar quizzes', profListaQuizzes));
  corpo.appendChild(criarBotao('<span class="rotulo">›</span>Acompanhar turma', profEscolherTurma));
  corpo.appendChild(criarBotao('<span class="rotulo">›</span>Gerar planilha', profEscolherTurmaPlanilha));
  corpo.appendChild(criarBotao("Sair do painel", telaLogin));
  const versao = document.createElement("p");
  versao.className = "rodape-dica";
  versao.textContent = "painel v6 (etapas 1 a 6)";
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