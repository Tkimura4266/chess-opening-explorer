(function () {
  'use strict';

  var game = new Chess();
  var board = null;
  var trees = {};       // { white: {nodes, games}, black: {nodes, games} } 局面(FEN)単位のグラフ
  var pgnByGameId = {};
  var color = 'white';
  var graph = null;      // trees[color]
  var currentNode = null;
  var path = [];         // array of SAN strings from root

  var RESULT_LABEL = { win: '勝ち', loss: '負け', draw: '引分' };

  function fetchJSON(url) {
    // 毎朝更新されるデータなので、ブラウザのキャッシュは必ずサーバーに確認してから使う
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('failed to load ' + url);
      return res.json();
    });
  }

  function loadColor(newColor) {
    color = newColor;
    $('#btn-white').toggleClass('active', color === 'white');
    $('#btn-black').toggleClass('active', color === 'black');

    if (trees[color]) {
      resetToRoot();
      return;
    }
    fetchJSON('data/tree_' + color + '.json').then(function (data) {
      trees[color] = data;
      resetToRoot();
    }).catch(function (err) {
      $('#hint').text('データの読み込みに失敗しました: ' + err.message);
    });
  }

  function resetToRoot() {
    game.reset();
    graph = trees[color];
    currentNode = graph.nodes[0];
    path = [];
    if (board) board.orientation(color === 'white' ? 'white' : 'black');
    if (board) board.position('start');
    $('#hint').text('');
    render();
  }

  // 局面 node から san を指した先の局面(無ければ null)
  function childOf(node, san) {
    var e = node.moves[san];
    return e ? graph.nodes[e[0]] : null;
  }

  function walkToPath(newPath) {
    game.reset();
    var node = graph.nodes[0];
    for (var i = 0; i < newPath.length; i++) {
      var next = childOf(node, newPath[i]);
      if (!next || !game.move(newPath[i])) { newPath = newPath.slice(0, i); break; }
      node = next;
    }
    path = newPath;
    currentNode = node;
    if (board) board.position(game.fen());
    render();
  }

  function playSan(san) {
    var child = childOf(currentNode, san);
    if (!child) return false;
    game.move(san);
    path = path.concat([san]);
    currentNode = child;
    if (board) board.position(game.fen());
    render();
    return true;
  }

  function moveLabel(index, san) {
    var moveNo = Math.floor(index / 2) + 1;
    if (index % 2 === 0) return moveNo + '.' + san;
    return san;
  }

  function renderBreadcrumb() {
    var $bc = $('#breadcrumb').empty();
    var $start = $('<span class="crumb">開始局面</span>').on('click', function () {
      walkToPath([]);
    });
    $bc.append($start);
    for (var i = 0; i < path.length; i++) {
      $bc.append('<span class="sep">/</span>');
      (function (idx) {
        var $c = $('<span class="crumb"></span>').text(moveLabel(idx, path[idx]));
        $c.on('click', function () { walkToPath(path.slice(0, idx + 1)); });
        $bc.append($c);
      })(i);
    }
  }

  function renderMoveList() {
    var $list = $('#move-list').empty();
    // 手ごとの成績は「この局面からその手を指した対局」で集計(どの手順で来たかは問わない)
    var entries = Object.keys(currentNode.moves).map(function (san) {
      var e = currentNode.moves[san];
      return [san, { count: e[1], wins: e[2], draws: e[3], losses: e[4] }];
    });
    entries.sort(function (a, b) { return b[1].count - a[1].count; });

    if (entries.length === 0) {
      $list.append('<p class="muted">この先の記録はまだありません。</p>');
      return;
    }

    entries.forEach(function (entry) {
      var san = entry[0], node = entry[1];
      var total = node.count || 1;
      var winPct = (node.wins / total) * 100;
      var drawPct = (node.draws / total) * 100;
      var lossPct = (node.losses / total) * 100;

      var $row = $('<div class="move-row"></div>');
      $row.append($('<span class="san"></span>').text(san));
      var $bar = $('<div class="result-bar"></div>');
      $bar.append($('<div class="win"></div>').css('width', winPct + '%'));
      $bar.append($('<div class="draw"></div>').css('width', drawPct + '%'));
      $bar.append($('<div class="loss"></div>').css('width', lossPct + '%'));
      $row.append($bar);
      $row.append($('<span class="count"></span>').text(node.count + '局'));
      $row.on('click', function () { playSan(san); });
      $list.append($row);
    });
  }

  function openOnLichess(gameId) {
    var pgn = pgnByGameId[gameId];
    if (!pgn) return;

    function proceed(copied) {
      var msg = copied
        ? '対局のPGNをコピーしました。開いたLichessのタブに貼り付けて(Ctrl+V)「Import game」を押してください。'
        : 'PGNのコピーに失敗しました。開いたLichessのタブに、以下のPGNを手動でコピーして貼り付けてください:\n\n' + pgn;
      window.alert(msg);
      var opened = window.open('https://lichess.org/paste', '_blank');
      $('#hint').text(copied ? 'PGNをコピー済みです。Ctrl+Vで貼り付けてください。' : 'PGNのコピーに失敗しました。');
      if (!opened) {
        $('#hint').text('ポップアップがブロックされました。ブラウザの設定を確認してください。');
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pgn).then(function () {
        proceed(true);
      }).catch(function () {
        proceed(false);
      });
    } else {
      proceed(false);
    }
  }

  function renderSampleGames() {
    var $ul = $('#sample-games').empty();
    var samples = (currentNode.samples || []).map(function (gid) {
      var g = graph.games[gid] || {};
      return { game_id: gid, date: g.date, opponent: g.opponent, result: g.result, url: g.url };
    });
    if (samples.length === 0) {
      $ul.append('<li class="muted">この局面につながる対局はありません。</li>');
      return;
    }
    samples.forEach(function (g) {
      var $li = $('<li></li>');
      var $badge = $('<span class="badge"></span>')
        .addClass(g.result)
        .text(RESULT_LABEL[g.result] || g.result);
      var $left = $('<span></span>').append($badge).append(' vs ' + g.opponent + ' (' + g.date + ')');

      var $right = $('<span class="game-links"></span>');
      if (pgnByGameId[g.game_id]) {
        var $lichessBtn = $('<a href="#">対局を見る (Lichess)</a>');
        $lichessBtn.on('click', function (e) {
          e.preventDefault();
          openOnLichess(g.game_id);
        });
        $right.append($lichessBtn);
        $right.append(' · ');
      }
      var $ccLink = $('<a target="_blank" rel="noopener">Chess.com</a>').attr('href', g.url);
      $right.append($ccLink);

      $li.append($left).append($right);
      $ul.append($li);
    });
  }

  // 複数の手順から到達している局面なら、その手順一覧を出す
  function renderTranspositions() {
    var $box = $('#transpositions').empty();
    var paths = currentNode.paths;
    if (!paths || paths.length < 2) {
      $('#transpositions-section').hide();
      return;
    }
    $('#transpositions-section').show();
    var cur = path.join(' ');
    if (currentNode.n_paths > paths.length) {
      $box.append($('<p class="muted"></p>').text('全' + currentNode.n_paths + '通りのうち上位' + paths.length + '通り'));
    }
    paths.forEach(function (pc) {
      var seq = pc[0] ? pc[0].split(' ') : [];
      var label = seq.map(function (san, i) { return moveLabel(i, san); }).join(' ');
      var $row = $('<div class="path-row"></div>');
      if (pc[0] === cur) $row.addClass('current');
      $row.append($('<span class="path-seq"></span>').text(label || '(開始局面)'));
      $row.append($('<span class="count"></span>').text(pc[1] + '局'));
      $row.on('click', function () { walkToPath(seq); });
      $box.append($row);
    });
  }

  function lichessAnalysisUrl(fen) {
    return 'https://lichess.org/analysis/' + encodeURI(fen) + '?color=' + color;
  }

  function render() {
    renderBreadcrumb();
    renderMoveList();
    renderTranspositions();
    renderSampleGames();
    var fallbackName = path.length === 0 ? '開始局面'
      : path.map(function (san, i) { return moveLabel(i, san); }).join(' ');
    $('#opening-name').text(path.length === 0 ? '開始局面' : (currentNode.opening || fallbackName));
    var total = currentNode.count || 0;
    $('#node-stats').text(
      total + '局 (勝ち ' + currentNode.wins + ' / 分け ' + currentNode.draws + ' / 負け ' + currentNode.losses + ')'
    );
    $('#lichess-link').attr('href', lichessAnalysisUrl(currentNode.fen));
  }

  function onDragStart(source, piece) {
    if (color === 'white' && piece.search(/^b/) !== -1) return false;
    if (color === 'black' && piece.search(/^w/) !== -1) return false;
  }

  function onDrop(source, target) {
    var move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';

    var next = childOf(currentNode, move.san);
    if (!next) {
      game.undo();
      $('#hint').text('この手 (' + move.san + ') はあなたの棋譜にはありません。');
      return 'snapback';
    }

    $('#hint').text('');
    path = path.concat([move.san]);
    currentNode = next;
    render();
  }

  function onSnapEnd() {
    board.position(game.fen());
  }

  $(function () {
    board = Chessboard('board', {
      draggable: true,
      position: 'start',
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
      onDragStart: onDragStart,
      onDrop: onDrop,
      onSnapEnd: onSnapEnd,
    });

    $('#btn-white').on('click', function () { loadColor('white'); });
    $('#btn-black').on('click', function () { loadColor('black'); });
    $('#btn-reset').on('click', function () { walkToPath([]); });

    fetchJSON('data/meta.json').then(function (meta) {
      $('#subtitle').text('Chess.com ' + meta.username + ' の全対局から作った自分だけのオープニングツリー。盤面の駒を動かすと辿れます。');
      $('#generated-at').text('Generated ' + meta.generated_at);
    });

    fetchJSON('data/games_pgn.json').then(function (data) {
      pgnByGameId = data;
    });

    loadColor('white');
  });
})();
