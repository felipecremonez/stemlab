# Avisos de terceiros

O StemLab utiliza bibliotecas e modelos mantidos por projetos independentes. Este arquivo resume os principais avisos; as licenças originais continuam prevalecendo.

## demucs-js / HTDemucs

Projeto: `bakkot/demucs-js`.

O código do repositório/pacote é disponibilizado sob licença MIT. Entretanto, o próprio `LICENSE.md` do projeto informa que o arquivo de pesos `htdemucs.onnx` **não** está coberto pela MIT e deriva de pesos fornecidos pela Meta, disponibilizados para **uso pessoal e de pesquisa**.

Durante o deploy, o workflow copia a licença do projeto para:

`public/demucs-engine/THIRD_PARTY_LICENSE.md`

Revise essas condições antes de qualquer uso comercial.

## @soundtouchjs/audio-worklet / SoundTouchJS

Projeto: `cutterbl/SoundTouchJS`.

O pacote `@soundtouchjs/audio-worklet` é utilizado no mixer para alteração de velocidade com compensação de pitch e para transposição em semitons.

Licença declarada pelo pacote: **Mozilla Public License 2.0 (MPL-2.0)**.

Ao redistribuir/modificar código coberto pela MPL, observe as obrigações da licença original.

## Meyda

Projeto: `meyda/meyda`.

Utilizado para extração de características de áudio, incluindo chroma, empregado na estimativa de tonalidade e acordes.

Licença: **MIT**.

## web-audio-beat-detector

Projeto: `chrisguttandin/web-audio-beat-detector`.

Utilizado para estimativa de BPM/tempo.

Licença: **MIT**.

## React, Vite e demais dependências

O projeto também utiliza React, ReactDOM, Vite e dependências transitivas. Consulte os respectivos pacotes e arquivos de licença gerados pelo ecossistema npm para os termos completos.

## Observação

Este arquivo é informativo e não substitui a leitura das licenças originais dos projetos de terceiros.

## YouTube.js / youtubei.js

A importação opcional por link do YouTube usa `youtubei.js` somente no serviço remoto localizado em `youtube-service/`. Esse serviço não executa a separação por IA; ele apenas resolve e retransmite o fluxo de áudio para o navegador.

O conector depende de interfaces do YouTube que podem mudar sem aviso. Use apenas conteúdo que você tenha autorização para processar e revise as condições aplicáveis do YouTube antes de disponibilizar o recurso publicamente.
