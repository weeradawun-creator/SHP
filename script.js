/* ==========================================================================
   sapoom — shared script (used on every page)
   Each section only runs when its elements exist on the current page:
     product.html : #filter-bar, #product-list
     order.html   : #orderForm, #customerName, #contact, #items, #total, #note
     admin.html   : #ordersTable tbody
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- Config ---------- */
  var PRODUCTS_URL = 'products.json';

  var ORDER_ENDPOINT =
    'https://script.google.com/macros/s/AKfycbyiFF58k8lLTAFnoCxn_RWiu--6_65tWoOX5mDsHec6p67YnxfeBhl-8Vves6BUxoLT/exec';

  var ORDERS_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vTy-3qoa3zkKrwk_eK80fQLfYsPT-fddyhF3ETsuGOKH7aSa41yUaJH7zOelPR4gIR9wcMroomSWDMq/pub?gid=0&single=true&output=csv';

  var MOODS = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'fresh', label: 'Fresh' },
    { key: 'sweet', label: 'Sweet' },
    { key: 'confident', label: 'Confident' },
    { key: 'romance', label: 'Romance' }
  ];

  /* ---------- Small helpers ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatPrice(n) {
    var num = Number(n);
    return isNaN(num) ? String(n) : num.toLocaleString('th-TH');
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /* ==========================================================================
     1) product.html — product cards + mood filter
     ========================================================================== */
  function initProducts() {
    var filterBar = document.getElementById('filter-bar');
    var list = document.getElementById('product-list');
    if (!filterBar || !list) return;

    var products = [];
    var currentMood = 'all';

    function isValidMood(m) {
      return MOODS.some(function (x) { return x.key === m; });
    }

    function buildOrderUrl(p) {
      var q = new URLSearchParams({ item: p.name, price: p.price });
      return 'order.html?' + q.toString();
    }

    function buildCard(p) {
      var card = el('article', 'product-card');
      card.setAttribute('data-mood', p.mood);

      var img = el('img', 'product-card__image');
      img.src = p.image;
      img.alt = p.name;
      img.loading = 'lazy';
      card.appendChild(img);

      var body = el('div', 'product-card__body');

      var title = el('h3', 'product-card__title');
      title.appendChild(el('span', 'mood-dot'));
      title.appendChild(document.createTextNode(p.name));
      body.appendChild(title);

      body.appendChild(el('p', 'product-card__meta', 'ขนาด ' + p.size));

      var price = el('p', 'product-card__price', formatPrice(p.price));
      price.appendChild(el('small', '', ' บาท'));
      body.appendChild(price);

      var btn = el('a', 'btn btn--block', 'สั่งซื้อ');
      btn.href = buildOrderUrl(p);
      body.appendChild(btn);

      card.appendChild(body);
      return card;
    }

    function render() {
      list.innerHTML = '';

      var shown = products.filter(function (p) {
        return currentMood === 'all' || p.mood === currentMood;
      });

      if (!shown.length) {
        list.appendChild(el('p', 'text-center', 'ยังไม่มีสินค้าในหมวดนี้'));
        return;
      }

      shown.forEach(function (p) { list.appendChild(buildCard(p)); });
    }

    function updateButtons() {
      Array.prototype.forEach.call(filterBar.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-mood') === currentMood));
      });
    }

    function setMood(mood, updateUrl) {
      currentMood = isValidMood(mood) ? mood : 'all';
      updateButtons();
      render();

      if (updateUrl && window.history && history.replaceState) {
        var url = new URL(window.location.href);
        if (currentMood === 'all') url.searchParams.delete('mood');
        else url.searchParams.set('mood', currentMood);
        history.replaceState(null, '', url.toString());
      }
    }

    // Build filter buttons
    filterBar.innerHTML = '';
    MOODS.forEach(function (m) {
      var b = el('button', '', m.label);
      b.type = 'button';
      b.setAttribute('data-mood', m.key);
      b.addEventListener('click', function () { setMood(m.key, true); });
      filterBar.appendChild(b);
    });

    // Load products, then apply ?mood=xxx from the URL
    list.appendChild(el('p', 'text-center', 'กำลังโหลดสินค้า...'));

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = Array.isArray(data) ? data : [];
        var fromUrl = (new URLSearchParams(window.location.search).get('mood') || '').toLowerCase();
        setMood(fromUrl, false);
      })
      .catch(function (err) {
        console.error(err);
        list.innerHTML = '';
        list.appendChild(el('p', 'text-center', 'โหลดสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'));
      });
  }

  /* ==========================================================================
     2) order.html — autofill from URL + submit to Apps Script
     ========================================================================== */
  function initOrder() {
    var form = document.getElementById('orderForm');
    if (!form) return;

    var params = new URLSearchParams(window.location.search);
    var itemsField = document.getElementById('items');
    var totalField = document.getElementById('total');

    // Autofill both fields as soon as the page loads
    var item = params.get('item');
    var price = params.get('price');
    if (itemsField && item !== null) itemsField.value = item;
    if (totalField && price !== null) totalField.value = price;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      var payload = {
        customerName: document.getElementById('customerName').value.trim(),
        contact: document.getElementById('contact').value.trim(),
        items: document.getElementById('items').value.trim(),
        total: document.getElementById('total').value.trim(),
        note: document.getElementById('note').value.trim()
      };

      fetch(ORDER_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  /* ==========================================================================
     3) admin.html — orders table from published Google Sheet CSV
     ========================================================================== */

  // Minimal CSV parser: handles quoted fields, "" escapes, commas and
  // line breaks inside quotes, and both \n and \r\n line endings.
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }

    // Last field / row (file without trailing newline)
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    // Drop completely empty rows
    return rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ''; });
    });
  }

  function initAdmin() {
    var tbody = document.querySelector('#ordersTable tbody');
    if (!tbody) return;

    var COLS = 6;

    function showMessage(msg) {
      tbody.innerHTML = '';
      var tr = document.createElement('tr');
      var td = el('td', '', msg);
      td.colSpan = COLS;
      td.style.textAlign = 'center';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage('กำลังโหลดข้อมูล...');

    // Timestamp param avoids a stale cached copy of the published CSV
    var url = ORDERS_CSV_URL + '&_=' + Date.now();

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        rows.shift(); // header row

        if (!rows.length) {
          showMessage('ยังไม่มีรายการสั่งซื้อ');
          return;
        }

        // Rows are appended to the sheet in time order, so reversing them
        // puts the newest order first without depending on date format.
        rows.reverse();

        tbody.innerHTML = '';
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          for (var i = 0; i < COLS; i++) {
            tr.appendChild(el('td', '', (r[i] || '').trim()));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (err) {
        console.error(err);
        showMessage('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      });
  }

  /* ---------- Init ---------- */
  ready(function () {
    initProducts();
    initOrder();
    initAdmin();
  });
})();
