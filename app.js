(function () {
  'use strict';

  var game = new Chess();
  var board = null;
  var trees = {};       // { white: rootNode, black: rootNode }
  var pgnByGameId = {};
  var color = 'white';
  var treeRoot = null;
  var currentNode = null;
  var path = [];         // array of SAN strings from root

  var RESULT_LABEL = { win: '勝ち', loss: '負け', draw: '引分' };

  function fetchJSON(url) {
    return fetch(url).then(function (res) {
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
    treeRoot = trees[color];
    currentNode = treeRoot;
    path = [];
    if (board) board.orientation(color === 'white' ? 'white' : 'black');
    if (board) board.position('start');
    $('#hint').text('');
    render();
  }

  function walkToPath(newPath) {
    game.reset();
    var node = treeRoot;
    for (var i = 0; i < newPath.length; i++) {
      game.move(newPath[i]);
      node = node.children[newPath[i]];
    }
    path = newPath;
    currentNode = node;
    if (board) board.position(game.fen());
    render();
  }

  function playSan(san) {
    var child = currentNode.children[san];
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
    var entries = Object.keys(currentNode.children).map(function (san) {
      return [san, currentNode.children[san]];
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
    var opened = window.open('https://lichess.org/paste', '_blank');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pgn).then(function () {
        $('#hint').text('対局のPGNをコピーしました。開いたLichessのタブに貼り付けて「Import game」を押してください。');
      }).catch(function () {
        $('#hint').text('PGNのコピーに失敗しました。');
      });
    }
    if (!opened) {
      $('#hint').text('ポップアップがブロックされました。ブラウザの設定を確認してください。');
    }
  }

  function renderSampleGames() {
    var $ul = $('#sample-games').empty();
    var samples = currentNode.samples || [];
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

  function lichessAnalysisUrl(fen) {
    return 'https://lichess.org/analysis/' + encodeURI(fen) + '?color=' + color;
  }

  function render() {
    renderBreadcrumb();
    renderMoveList();
    renderSampleGames();
    $('#opening-name').text(currentNode.opening || (path.length === 0 ? '開始局面' : '(未分類)'));
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

    if (!currentNode.children[move.san]) {
      game.undo();
      $('#hint').text('この手 (' + move.san + ') はあなたの棋譜にはありません。');
      return 'snapback';
    }

    $('#hint').text('');
    path = path.concat([move.san]);
    currentNode = currentNode.children[move.san];
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
