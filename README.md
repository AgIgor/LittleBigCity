# LittleBigCity

Construtor de cidades isométrico que roda no navegador. O mapa começa só com mata, rio e campo, e a cidade cresce sozinha conforme você abre ruas e marca zonas.

## Como rodar

O jogo usa módulos JavaScript, então precisa de um servidor local (abrir o `index.html` direto não funciona).

- Windows: dois cliques em `iniciar.bat`
- Ou no terminal: `python -m http.server 8642` e abrir http://127.0.0.1:8642/

Depois de mudar o código, use **Ctrl+F5** para o navegador não usar a versão antiga.

## Controles

| Ação | Mouse | Toque |
|---|---|---|
| Usar ferramenta | botão esquerdo (arrastar para área/linha) | um dedo |
| Mover o mapa | botão direito ou do meio, ou arrastar no modo Inspecionar | dois dedos, ou um dedo no modo Inspecionar |
| Zoom | roda do mouse | pinça |

Teclado: `1`–`7` ferramentas, `WASD`/setas movem, `+`/`-` zoom, `espaço` pausa, `Esc` cancela.

## Como a cidade cresce

- Zonas só crescem a até 2 tiles de uma rua.
- **R** (residencial) traz moradores, **C** (comercial) e **I** (industrial) dão empregos. As barras R/C/I no topo mostram a demanda.
- Prédios sobem de nível (casa → sobrado → prédio) quando a cidade passa de 120 e 600 habitantes.
- Impostos entram todo fim de mês; as ruas custam manutenção.
- O jogo salva sozinho no navegador a cada mês.

## Jogar com amigos

1. Quem vai hospedar clica em **Jogar junto › Criar sala com esta cidade** e passa o código de 5 letras.
2. Os amigos abrem o jogo, clicam em **Jogar junto**, digitam o código e **Entrar**.

O anfitrião roda a simulação e guarda a cidade. Todos constroem, e o caixa é um só. Qualquer jogador pode mudar a velocidade, e cada um vê o cursor dos outros com nome e cor. Se o anfitrião sair, os convidados voltam para a própria cidade salva.

A conexão é direta entre os navegadores (WebRTC via PeerJS). O servidor público do PeerJS só apresenta os jogadores, então não é preciso servidor próprio. Para um amigo de fora jogar, o jogo precisa estar publicado (por exemplo no GitHub Pages), não só em `127.0.0.1`.

## Estrutura

```
index.html, style.css   interface
lib/pixi.min.mjs        PixiJS 8 (desenho em WebGL)
lib/peerjs.min.js       PeerJS 1.5 (conexão entre jogadores)
src/config.js           constantes do jogo (tamanhos, custos, lotação)
src/rng.js              aleatório com semente e ruído
src/world.js            dados do mapa, geração e salvamento
src/actions.js          ações do jogador (rua, zona, desmatar, demolir)
src/sim.js              simulação diária: demanda, obras, orçamento
src/art.js              todos os sprites, desenhados por código
src/atlas.js            junta os sprites em texturas grandes
src/render.js           cena: camadas, câmera, recorte da tela
src/input.js            mouse, toque e teclado
src/ui.js               barra superior, ferramentas, painéis
src/net.js              multiplayer: salas, ações dos convidados, envio de mudanças
```

Toda mudança no mapa passa por `actions.apply()`. No multiplayer, o convidado manda a ação ao anfitrião, que aplica e devolve só os tiles alterados (`world.changed`).
