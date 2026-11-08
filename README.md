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

Teclado: `1`–`9` ferramentas (`7` abre os serviços), `WASD`/setas movem, `+`/`-` zoom, `espaço` pausa, `Esc` cancela.

## Como a cidade cresce

- Zonas só crescem a até 2 tiles de uma rua.
- **R** (residencial) traz moradores, **C** (comercial) e **I** (industrial) dão empregos. As barras R/C/I no topo mostram a demanda.
- Prédios sobem de nível (casa → sobrado → prédio) quando a cidade passa de 120 e 600 habitantes e quando têm os serviços:
  - **nível 2:** energia (usina);
  - **nível 3:** energia e água (caixa d'água), mais **escola e posto de saúde** para residências ou **delegacia** para comércio e indústria, e terreno valorizado para residências e comércio.
- Os serviços ficam no botão **Serviços** (tecla 7). Prédios sem algum serviço ganham um ícone flutuando; os alertas no topo levam a câmera até a região do problema.
- **Valor do terreno:** praças, rio e serviços valorizam; indústria desvaloriza. O botão **Valor** mostra o mapa de calor. Terreno valorizado faz residências e comércio crescerem mais rápido.
- **Orçamento:** clique no caixa para abrir. Cada zona tem seu imposto (0% a 20%, padrão 9%); imposto alto arrecada mais, mas derruba a demanda.
- Rua sobre a água vira **ponte**. Ruas, pontes, serviços e praças custam manutenção.
- **Dia e noite:** a cidade escurece, janelas, postes e faróis acendem. Dá para desligar no menu ☰.
- **Novo mapa** (menu ☰): escolha o tamanho (96, 128 ou 192) e a semente; a mesma semente gera o mesmo mapa.
- O jogo salva sozinho no navegador a cada mês.
- Carros, ônibus e pedestres circulam pelas ruas conforme a população e os empregos.

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
src/traffic.js          carros, ônibus e pedestres (só visual, não vai pela rede)
```

Toda mudança no mapa passa por `actions.apply()`. No multiplayer, o convidado manda a ação ao anfitrião, que aplica e devolve só os tiles alterados (`world.changed`).
