# LittleBigCity

Construtor de cidades isométrico e tranquilo que roda no navegador. O mapa começa só com mata, rio e campo; você escolhe cada prédio num catálogo, coloca onde quiser e coleta as moedas que eles rendem.

## Como rodar

O jogo usa módulos JavaScript, então precisa de um servidor local (abrir o `index.html` direto não funciona).

- Windows: dois cliques em `iniciar.bat`
- Ou no terminal: `python -m http.server 8642` e abrir http://127.0.0.1:8642/

Depois de mudar o código, use **Ctrl+F5** para o navegador não usar a versão antiga.

## Controles

| Ação | Mouse | Toque |
|---|---|---|
| Construir | escolha no catálogo e clique (ruas e árvores: arraste) | um dedo |
| Coletar moedas | clique na moeda ou no prédio | toque |
| Mover o mapa | botão direito ou do meio, ou arrastar com a mão | dois dedos, ou um dedo com a mão |
| Zoom | roda do mouse | pinça |

Teclado: `1` mão, `2`–`7` abrem o catálogo (ruas, casas, comércio, indústria, decoração, especiais), `8` demolir, `C` coleta tudo, `Esc` volta para a mão, `WASD`/setas movem, `+`/`-` zoom, `espaço` pausa.

## Como jogar

- **Casas** trazem moradores e rendem aluguel. **Comércio** e **indústria** rendem mais, mas precisam de trabalhadores: cada morador é um trabalhador.
- Prédios precisam de uma rua a até 2 tiles. Rua sobre a água vira **ponte**.
- Quando um prédio tem moedas prontas, aparece uma moeda em cima dele. Toque nela ou use o botão **Coletar** no topo.
- Construir e coletar dá **experiência**. Cada nível dá um prêmio em moedas, libera prédios novos no catálogo e aumenta a área da cidade (o contorno dourado).
- **Decoração** (árvores, canteiros, parquinho, chafariz, ponto de ônibus) e **especiais** (escola, posto, bombeiros, usina, prefeitura, estádio, torre...) aumentam o rendimento dos prédios em volta. Ao escolher um deles, a área do bônus aparece em amarelo.
- Não há contas a pagar nem desastres: é só construir.
- **Dia e noite** e **clima** (sol, nublado, chuva, tempestade) são só visuais. O ciclo de dia e noite pode ser desligado no menu ☰.
- **Novo mapa** (menu ☰): escolha o tamanho (96, 128 ou 192) e a semente; a mesma semente gera o mesmo mapa.
- O jogo salva sozinho no navegador. Uma cidade da versão antiga (com zonas) é convertida na primeira vez que o jogo abre.
- Carros, ônibus e pedestres circulam pelas ruas conforme a população e os empregos.

## Jogar com amigos

1. Quem vai hospedar clica em **Jogar junto › Criar sala com esta cidade** e passa o código de 5 letras.
2. Os amigos abrem o jogo, clicam em **Jogar junto**, digitam o código e **Entrar**.

O anfitrião roda a simulação e guarda a cidade. Todos constroem e coletam, e as moedas e o nível são da cidade. Qualquer jogador pode mudar a velocidade, e cada um vê o cursor dos outros com nome e cor. Se o anfitrião sair, os convidados voltam para a própria cidade salva.

A conexão é direta entre os navegadores (WebRTC via PeerJS). O servidor público do PeerJS só apresenta os jogadores, então não é preciso servidor próprio. Para um amigo de fora jogar, o jogo precisa estar publicado (por exemplo no GitHub Pages), não só em `127.0.0.1`.

## Estrutura

```
index.html, style.css   interface
lib/pixi.min.mjs        PixiJS 8 (desenho em WebGL)
lib/peerjs.min.js       PeerJS 1.5 (conexão entre jogadores)
src/config.js           constantes do jogo (tamanhos, custos, velocidades)
src/catalog.js          catálogo de prédios, níveis e área da cidade
src/rng.js              aleatório com semente e ruído
src/world.js            dados do mapa, geração e salvamento
src/actions.js          ações do jogador (construir, coletar, demolir)
src/sim.js              simulação diária: obras, moedas, clima
src/art.js              todos os sprites, desenhados por código
src/atlas.js            junta os sprites em texturas grandes
src/render.js           cena: camadas, câmera, recorte da tela
src/input.js            mouse, toque e teclado
src/ui.js               barra superior, catálogo, painéis
src/net.js              multiplayer: salas, ações dos convidados, envio de mudanças
src/traffic.js          carros, ônibus e pedestres (só visual, não vai pela rede)
```

Toda mudança no mapa passa por `actions.apply()`. No multiplayer, o convidado manda a ação ao anfitrião, que aplica e devolve só os tiles alterados (`world.changed`).
