# StemLab Web v5.1 — Music Intelligence Lab

O **StemLab** é uma aplicação musical executada diretamente no navegador. Ela separa uma música em stems, cria um mixer sincronizado e adiciona ferramentas de estudo musical. Arquivos enviados pelo usuário são processados localmente; a entrada opcional por YouTube usa um pequeno serviço remoto apenas para obter o áudio antes da separação.

Endereço esperado do projeto publicado:

`https://felipecremonez.github.io/stemlab/`

> Para **usar** o StemLab, o visitante não instala Node.js, Python, FFmpeg ou qualquer outro programa. Node.js é utilizado apenas pelo GitHub Actions durante a compilação/publicação do site.

## Principais funcionalidades

### Separação por IA

- Voz + Instrumental no modo **Simples**.
- Voz, Bateria, Baixo e Outros no modo **Studio**.
- Instrumental derivado das stems instrumentais.
- Processamento local com HTDemucs + ONNX no navegador.
- WebGPU quando disponível e fallback por CPU/WebAssembly.
- Modos de processamento:
  - **Turbo** — overlap 0.10, ajustado para evitar instabilidade/silêncio em alguns arquivos.
  - **Equilíbrio** — overlap 0.15.
  - **Studio** — overlap 0.25.
- Cache do modelo de IA no navegador para reduzir downloads repetidos.
- Barra de progresso e estimativa de tempo restante.
- Reprodução das stems usando preview WAV local para evitar falhas de reprodução do MP3 codificado.
- Sanitização do sinal retornado pelo modelo para remover valores inválidos e proteger o player.

### Music Lab

- Estimativa automática de **BPM**.
- Estimativa de **tonalidade** maior/menor.
- Linha do tempo de **acordes estimados**.
- Acordes atualizados visualmente quando a música é transposta.
- Clique em um acorde para navegar para aquele ponto da faixa.

> BPM, tonalidade e acordes são análises automáticas e podem errar, especialmente em gravações com modulações, afinações alternativas, ruído, acordes complexos ou mixagens densas.

### Mixer sincronizado

- Player único que mantém as stems sincronizadas.
- Controle de volume individual.
- **Mute** por stem.
- **Solo** por stem.
- Presets de comparação:
  - Original.
  - Voz.
  - Instrumental.
  - Voz + Instrumental.
  - 4 Stems no modo Studio.
- Waveform das stems processadas.

### Ferramentas para músicos

- Velocidade de reprodução entre **0.5x e 1.5x**.
- Alteração de velocidade com compensação de pitch.
- Transposição independente de **-12 a +12 semitons**.
- Loop configurável por início e fim.
- Botões para transformar a posição atual em início/fim do loop.
- Marcação manual da estrutura da música:
  - Intro.
  - Verso.
  - Pré-refrão.
  - Refrão.
  - Ponte.
  - Solo.
  - Outro.
- Navegação pelas marcações.

### Exportação

- Download completo das stems geradas.
- Saída em **MP3** ou **WAV**.
- Exportação de apenas um intervalo da música.
- Escolha da stem e dos segundos inicial/final do recorte.

### Histórico e preferências

- Histórico local usando IndexedDB.
- Até 5 sessões recentes.
- Quando o volume dos arquivos permite, as stems são guardadas no próprio navegador e podem ser reabertas.
- Em sessões grandes, o StemLab salva apenas os metadados para evitar ocupar armazenamento excessivo.
- Preferências persistentes:
  - Tema claro/escuro.
  - Modo de qualidade.
  - Formato de saída.
  - Modo Simples/Studio.

### PWA

O projeto inclui:

- `manifest.webmanifest`.
- Service Worker.
- Ícones 192x192 e 512x512.
- Cache do shell da aplicação.
- Cache separado para o modelo HTDemucs.
- Botão **Instalar app** em navegadores que disponibilizam o evento de instalação.

A disponibilidade do botão varia conforme navegador e sistema. Mesmo sem instalar como PWA, o StemLab continua funcionando normalmente pelo site.

## Atalhos de teclado

Com o Music Lab aberto e sem um campo de formulário selecionado:

- `Espaço` — Play/Pause.
- `L` — ativar/desativar loop.
- `←` — voltar 5 segundos.
- `→` — avançar 5 segundos.
- `V` — ouvir somente Voz.
- `I` — ouvir somente Instrumental.
- `O` — ouvir Original.

## Como utilizar

1. Acesse `https://felipecremonez.github.io/stemlab/`.
2. Escolha **Arquivo** ou **YouTube** na entrada de sinal.
3. Em **Arquivo**, arraste a música ou clique para selecionar. Em **YouTube**, cole o link e clique em **Importar**.
4. Escolha **Turbo**, **Equilíbrio** ou **Studio**.
5. Escolha a saída:
   - **Simples**: Voz + Instrumental.
   - **Studio**: Voz + Bateria + Baixo + Outros + Instrumental.
6. Escolha **MP3** ou **WAV**.
7. Inicie a separação.
8. Na primeira utilização, aguarde o modelo de IA ser preparado no navegador.
9. Após o processamento, use o Music Lab para ouvir, comparar, transpor, alterar velocidade, criar loops, marcar partes e exportar stems ou trechos.


## Importação por link do YouTube

O GitHub Pages não consegue acessar diretamente os fluxos de áudio do YouTube a partir do navegador. Por isso o StemLab v5.1 inclui a pasta `youtube-service/`, um serviço Node.js separado que apenas:

1. recebe o link do YouTube;
2. resolve o vídeo;
3. envia o fluxo de áudio para o navegador;
4. não executa Demucs e não processa as stems.

A separação por IA continua acontecendo no navegador do usuário.

> Use a importação somente com conteúdo que você tenha autorização para processar. O YouTube pode alterar mecanismos internos de streaming, então esse conector pode precisar de manutenção futura.

### Publicar o serviço do YouTube no Render

O repositório já inclui `render.yaml` na raiz e `youtube-service/`. Uma forma simples é:

1. Entre no Render e crie um **Blueprint** a partir do repositório `felipecremonez/stemlab`.
2. O Render detectará `render.yaml` e criará o serviço `stemlab-youtube-service`.
3. Aguarde o deploy e copie a URL HTTPS gerada, por exemplo `https://seu-servico.onrender.com`.
4. No GitHub do StemLab, entre em **Settings → Secrets and variables → Actions → Variables**.
5. Crie a variável:

```text
YOUTUBE_API_BASE=https://seu-servico.onrender.com
```

6. Rode novamente o workflow **Deploy StemLab Web** ou faça um novo push.

Depois disso, o campo **YouTube** no site público passa a funcionar sem qualquer instalação para o visitante.

### Testar o serviço

Abra:

```text
https://seu-servico.onrender.com/health
```

A resposta esperada é:

```json
{ "ok": true, "service": "stemlab-youtube-service" }
```

O serviço aceita apenas origens configuradas em `ALLOWED_ORIGINS`; o arquivo entregue já permite `https://felipecremonez.github.io`.

## Formatos de entrada

A interface aceita:

- MP3
- WAV
- FLAC
- M4A
- AAC
- OGG
- OPUS
- WebM

A decodificação efetiva depende dos codecs suportados pelo navegador e pelo sistema operacional. MP3 e WAV são as opções mais seguras para testes.

## Privacidade

O processamento de separação continua acontecendo no dispositivo do visitante. Arquivos escolhidos por upload não são enviados ao serviço do YouTube.

Quando a entrada por YouTube é usada, o serviço remoto recebe o link e retransmite o áudio ao navegador; depois disso, a separação ocorre localmente. O site também precisa baixar seus arquivos estáticos e o modelo de IA, especialmente na primeira utilização.

## Desempenho

Separação neural de áudio é pesada. O tempo depende de:

- duração da música;
- GPU/CPU disponível;
- memória RAM;
- navegador;
- modo Turbo/Equilíbrio/Studio;
- quantidade de stems e formato escolhido para exportação.

O modo Studio consome mais memória porque mantém mais stems disponíveis no mixer. Em dispositivos modestos, prefira o modo Simples e músicas menores.

## Publicar no GitHub Pages

### Estrutura esperada na raiz do repositório

```text
stemlab/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── public/
│   ├── icons/
│   ├── demucs-engine/
│   ├── manifest.webmanifest
│   └── sw.js
├── scripts/
│   └── patch-demucs.mjs
├── src/
│   ├── App.jsx
│   ├── audio.js
│   ├── demucsClient.js
│   ├── main.jsx
│   ├── mixerEngine.js
│   ├── musicAnalysis.js
│   ├── storage.js
│   ├── youtubeClient.js
│   └── styles.css
├── youtube-service/
│   ├── package.json
│   └── server.js
├── render.yaml
├── index.html
├── package.json
├── vite.config.js
├── THIRD_PARTY_NOTICES.md
└── README.md
```

Não envie `node_modules`, `dist` ou `vendor` para o repositório.

### Configuração única do GitHub

No repositório:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Depois disso, cada push em `main` ou `master` executa automaticamente o workflow `Deploy StemLab Web`.

O workflow:

1. baixa o código do StemLab;
2. baixa o `demucs-js` e seus pesos via Git LFS;
3. aplica o suporte aos níveis de overlap do StemLab;
4. compila o motor Demucs para navegador;
5. instala as dependências de build do StemLab;
6. injeta opcionalmente `YOUTUBE_API_BASE` no build;
7. compila React/Vite;
8. publica o diretório final no GitHub Pages.

Quando a Action estiver verde, acesse:

`https://felipecremonez.github.io/stemlab/`

## Desenvolvimento local — opcional

Esta parte é somente para quem vai alterar o código. Não é necessária para usar o site publicado.

O build completo depende também do motor `demucs-js`, que o GitHub Actions prepara automaticamente. Portanto, o caminho mais simples para validar a versão pública é fazer commit/push e acompanhar a Action.

## Bibliotecas principais

- React / ReactDOM — interface.
- Vite — build.
- demucs-js — separação de stems no navegador.
- ONNX Runtime Web — execução do modelo.
- Meyda — extração de características musicais/chroma.
- web-audio-beat-detector — estimativa de BPM.
- @soundtouchjs/audio-worklet — controle de velocidade e pitch no mixer.
- IndexedDB / Cache Storage / Service Worker — histórico, cache e PWA.
- YouTube.js — somente no serviço remoto opcional de importação por link.

Consulte `THIRD_PARTY_NOTICES.md` para avisos de licenciamento.

## Aviso sobre os pesos do modelo

O código do `demucs-js` é disponibilizado sob MIT, mas o próprio projeto informa que o arquivo de pesos `htdemucs.onnx` não está coberto pela licença MIT e deriva de pesos da Meta disponibilizados para **uso pessoal e de pesquisa**.

Antes de utilizar o modelo em contexto comercial, revise as condições descritas em `THIRD_PARTY_NOTICES.md` e na licença copiada para `public/demucs-engine/THIRD_PARTY_LICENSE.md` durante o deploy.
