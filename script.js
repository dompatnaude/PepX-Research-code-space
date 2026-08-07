// ---------- Product data ----------
var PRODUCTS = [
  {id:'ghkcu_100_50', name:'GHK-CU', tag:'REPAIR SUPPORT', color:'#fdeef4;color:#db2777', category:'Repair', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['100mg','50mg'], image:'assets/products/IMG_7608.png'},
  {id:'glutathione_1500_600', name:'Glutathione', tag:'METABOLIC SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Metabolic', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['1500mg','600mg'], image:'assets/products/IMG_7608.png'},
  {id:'hcg_5000iu', name:'HCG', tag:'GROWTH SUPPORT', color:'#fff4e5;color:#d97706', category:'Growth', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['5000iu'], image:'assets/products/IMG_7608.png'},
  {id:'ipamorelin_10', name:'Ipamorelin', tag:'GROWTH SUPPORT', color:'#fff4e5;color:#d97706', category:'Growth', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'igf1lr3_1', name:'Igf-1-lr3', tag:'GROWTH SUPPORT', color:'#fff4e5;color:#d97706', category:'Growth', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['1mg'], image:'assets/products/IMG_7608.png'},
  {id:'klow_80', name:'KLOW', tag:'RECOVERY BLEND', color:'#e8fbef;color:#16a34a', category:'Recovery', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['80mg'], image:'assets/products/IMG_7608.png'},
  {id:'kpv_10', name:'KPV', tag:'RECOVERY SUPPORT', color:'#e8fbef;color:#16a34a', category:'Recovery', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'motsc_10', name:'MOTS-C', tag:'CELLULAR SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Cellular', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'mt1_10', name:'MT1', tag:'NEURO SUPPORT', color:'#fdeef4;color:#db2777', category:'Neuro', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'mt2_10', name:'MT2', tag:'NEURO SUPPORT', color:'#fdeef4;color:#db2777', category:'Neuro', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'nad_500', name:'NAD+', tag:'CELLULAR SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Cellular', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['500mg'], image:'assets/products/IMG_7608.png'},
  {id:'reta_10_20_30', name:'GLP-3RT', tag:'METABOLIC SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Metabolic', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg','20mg','30mg'], image:'assets/products/IMG_7608.png'},
  {id:'sermorelin_10', name:'Sermorelin acetate', tag:'GROWTH SUPPORT', color:'#fff4e5;color:#d97706', category:'Growth', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'selank_10', name:'Selank', tag:'NEURO SUPPORT', color:'#fdeef4;color:#db2777', category:'Neuro', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'semax_10', name:'Semax', tag:'NEURO SUPPORT', color:'#fdeef4;color:#db2777', category:'Neuro', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'ss31_10', name:'Ss-31', tag:'CELLULAR SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Cellular', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'thymosin_a1_5', name:'Thymosin alpha 1', tag:'GROWTH SUPPORT', color:'#fff4e5;color:#d97706', category:'Growth', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['5mg'], image:'assets/products/IMG_7608.png'},
  {id:'tb500_10', name:'Tb500', tag:'RECOVERY SUPPORT', color:'#e8fbef;color:#16a34a', category:'Recovery', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'tesamorelin_10', name:'Tesamorelin', tag:'GROWTH SUPPORT', color:'#fff4e5;color:#d97706', category:'Growth', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'adamax_10', name:'Adamax', tag:'NEURO SUPPORT', color:'#fdeef4;color:#db2777', category:'Neuro', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'aod9604_10', name:'Aod9604', tag:'METABOLIC SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Metabolic', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'ahkcu_50', name:'Ahk-cu', tag:'REPAIR SUPPORT', color:'#fdeef4;color:#db2877', category:'Repair', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['50mg'], image:'assets/products/IMG_7608.png'},
  {id:'5amino1mq', name:'5-amino-1mq', tag:'METABOLIC SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Metabolic', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['1mq'], image:'assets/products/IMG_7608.png'},
  {id:'bpc157_10', name:'Bpc 157', tag:'RECOVERY SUPPORT', color:'#e8fbef;color:#16a34a', category:'Recovery', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'bpc_tb500_10_10', name:'Bpc + tb500', tag:'RECOVERY BLEND', color:'#e8fbef;color:#16a34a', category:'Recovery', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg+10mg'], image:'assets/products/IMG_7608.png'},
  {id:'cagrilinitide_10', name:'Cagrilinitide', tag:'METABOLIC SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Metabolic', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'cjc1295_nodac_10', name:'Cjc 1295 no DAC', tag:'GROWTH SUPPORT', color:'#fff4e5;color:#d97706', category:'Growth', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'cjc1295_ipa_5', name:'Cjc1295 no dac + ipa', tag:'GROWTH BLEND', color:'#fff4e5;color:#d97706', category:'Growth', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['5mg'], image:'assets/products/IMG_7608.png'},
  {id:'dsip_10', name:'DSIP', tag:'NEURO SUPPORT', color:'#fdeef4;color:#db2877', category:'Neuro', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'epithalon_10', name:'Epithalon', tag:'CELLULAR SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Cellular', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'},
  {id:'tirzepitide_10', name:'Tirzepitide', tag:'METABOLIC SUPPORT', color:'#eef1fc;color:#2f43e0', category:'Metabolic', description:'Research-grade peptide reagent for controlled laboratory workflows.', price:100.00, dosages:['10mg'], image:'assets/products/IMG_7608.png'}
];
var STORAGE_KEY = 'pepxCart';
var GATE_ACCEPTED_KEY = 'pepxGateAccepted';
var cart = {};
var cartData = { items: [], total: 0 };
var cartItemIndex = {};
var selectedProductId = null;
var activeCategory = 'all';
var activeSort = 'default';
var currentAuthSession = null;
var checkoutState = {
  shippingCost: 0,
  appliedPromoCode: null,
  appliedPromo: null,
  promoValidating: false,
  selectedRate: null,          // { rateId, carrier, service, canonicalService, price, deliveryDays }
  easypostShipmentId: null,
  shippingRates: [],
  shippingRatesLoading: false,
  shippingRatesError: null,
  lastRatedAddress: null
};
var FREE_SHIPPING_THRESHOLD = 150;
var FLAT_SHIPPING_RATE = 9.95;
var cartItemPendingMap = Object.create(null);
var lastAnnouncedTotalsText = '';
var miniCartFocusReturnEl = null;
var miniCartPreviouslyFocused = null;
var DEFAULT_PRODUCT_IMAGE_URL = 'assets/products/default-product.png';
var homeFeaturedProductIds = null;
var THEME_MODE_STORAGE_KEY = 'pepxThemeMode';
var productsLoadedFromAPI = false;
var productsLoadPromise = null;
var productsLoadAbortController = null;
var productsLoadRequestToken = 0;
var productsLastLoadedAt = 0;
var heroBestSellersController = null;
var productDetailRenderToken = 0;
var appBootstrapInitialized = false;

function applyThemeMode(mode){
  var isDark = mode === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  var toggle = document.getElementById('themeModeToggle');
  if(toggle){
    toggle.textContent = isDark ? 'Day mode' : 'Night mode';
    toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    toggle.setAttribute('aria-label', isDark ? 'Switch to day mode' : 'Switch to night mode');
    toggle.setAttribute('title', isDark ? 'Switch to day mode' : 'Switch to night mode');
  }
}

function initThemeMode(){
  var icons = document.querySelector('.icons');
  if(icons && !document.getElementById('themeModeToggle')){
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'themeModeToggle';
    toggle.className = 'icon-btn theme-toggle-btn';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.textContent = 'Night mode';
    icons.insertBefore(toggle, icons.firstChild);
  }

  var saved = null;
  try {
    saved = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
  } catch (err) {
    saved = null;
  }

  var initialMode = saved === 'dark' ? 'dark' : 'light';
  applyThemeMode(initialMode);

  var toggleEl = document.getElementById('themeModeToggle');
  if(toggleEl){
    toggleEl.addEventListener('click', function(){
      var nextMode = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
      applyThemeMode(nextMode);
      try {
        window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
      } catch (err) {}
    });
  }
}

function getProductImage(product){
  return (product && product.image) ? product.image : DEFAULT_PRODUCT_IMAGE_URL;
}

function getProductDisplayName(product){
  if(!product || !product.name) return '';
  return product.name;
}

function normalizeCategoryFilter(value){
  if(!value) return 'all';
  var normalized = String(value).trim().toLowerCase();
  if(normalized === 'all') return 'all';
  var match = PRODUCTS.find(function(product){
    return product.category.toLowerCase() === normalized;
  });
  return match ? match.category : 'all';
}

function syncActiveCategoryPills(){
  document.querySelectorAll('.page-shop .pill-list .pill').forEach(function(item){
    item.classList.toggle('active', item.getAttribute('data-filter') === activeCategory);
  });
}

function initShopCategoryFromUrl(){
  var params = new URLSearchParams(window.location.search);
  activeCategory = normalizeCategoryFilter(params.get('category'));
  syncActiveCategoryPills();
}

function initMenuDropdowns(){
  var menuItems = document.querySelectorAll('.menu-item');
  if(!menuItems.length) return;

  function closeAllDropdowns(){
    menuItems.forEach(function(item){ item.classList.remove('open'); });
  }

  menuItems.forEach(function(item){
    item.addEventListener('mouseenter', function(){
      closeAllDropdowns();
      item.classList.add('open');
    });
    item.addEventListener('focusin', function(){
      closeAllDropdowns();
      item.classList.add('open');
    });
  });

  document.addEventListener('click', function(e){
    var clickedItem = e.target.closest('.menu-item');
    if(clickedItem){
      menuItems.forEach(function(item){
        item.classList.toggle('open', item === clickedItem);
      });
      return;
    }
    closeAllDropdowns();
  });

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeAllDropdowns();
  });
}

function initMobileNav(){
  var nav = document.querySelector('nav.menu');
  var toggle = document.getElementById('mobileMenuToggle');
  if(!nav || !toggle) return;

  function closeNav(){
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', function(){
    var isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  nav.querySelectorAll('a').forEach(function(link){
    link.addEventListener('click', closeNav);
  });

  document.addEventListener('click', function(e){
    if(nav.contains(e.target) || toggle.contains(e.target)) return;
    closeNav();
  });

  window.addEventListener('resize', function(){
    if(window.innerWidth > 900) closeNav();
  });
}

function initQuantitySteppers(){
  document.querySelectorAll('.qty-stepper-btn[data-qty-target][data-qty-delta]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var targetId = btn.getAttribute('data-qty-target');
      var delta = parseInt(btn.getAttribute('data-qty-delta'), 10);
      var input = document.getElementById(targetId);
      if(!input || !Number.isFinite(delta) || delta === 0) return;

      var min = parseInt(input.getAttribute('min'), 10);
      if(!Number.isFinite(min)) min = 0;

      var current = parseInt(input.value, 10);
      if(!Number.isFinite(current)) current = Math.max(min, 1);

      var next = Math.max(min, current + delta);
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
          if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) { input.focus(); }
    });
  });
}

function initHeaderFogOnScroll(){
  var header = document.querySelector('header');
  if(!header) return;

  var fadeDistance = 260;

  function updateHeaderFog(){
    var scrollTop = window.scrollY || window.pageYOffset || 0;
    var progress = Math.min(Math.max(scrollTop / fadeDistance, 0), 1);
    var alpha = 1 - (progress * 0.42);
    header.style.setProperty('--header-bg-alpha', alpha.toFixed(3));
  }

  updateHeaderFog();
  window.addEventListener('scroll', updateHeaderFog, { passive: true });
  window.addEventListener('resize', updateHeaderFog);
}

function getProductById(id){
  if(id == null) return null;
  var lookup = String(id).trim().toLowerCase();
  if(!lookup) return null;
  return PRODUCTS.find(function(item){
    var idMatch = String(item && item.id != null ? item.id : '').trim().toLowerCase() === lookup;
    var slugMatch = String(item && item.slug != null ? item.slug : '').trim().toLowerCase() === lookup;
    return idMatch || slugMatch;
  }) || null;
}

function getProductVariants(product){
  if(!product || !Array.isArray(product.variants)) return [];
  return product.variants.filter(function(v){ return v && Number.isFinite(Number(v.price)); });
}

function getDefaultVariant(product){
  var variants = getProductVariants(product);
  if(!variants.length) return null;
  var inStock = variants.find(function(v){ return Number(v.stock_quantity || 0) > 0; });
  return inStock || variants[0] || null;
}

function getSelectedVariant(product){
  if(!product) return null;
  var variants = getProductVariants(product);
  if(!variants.length) return null;
  var selectedId = Number(product.selected_variant_id);
  var selected = variants.find(function(v){ return Number(v.id) === selectedId; });
  if(selected) return selected;
  var fallback = getDefaultVariant(product);
  if(fallback) product.selected_variant_id = Number(fallback.id);
  return fallback;
}

function getProductStockQuantity(product, variant){
  if(variant){
    return Math.max(0, Number(variant.stock_quantity || 0));
  }
  var variants = getProductVariants(product);
  if(variants.length){
    return variants.reduce(function(sum, v){ return sum + Math.max(0, Number(v.stock_quantity || 0)); }, 0);
  }
  return Math.max(0, Number(product && product.stock_quantity || 0));
}

function getProductStockStatus(product, variant){
  if(variant){
    var variantQty = getProductStockQuantity(product, variant);
    if(variantQty <= 0) return 'sold_out';
    if(variantQty <= 5) return 'low_stock';
    return 'in_stock';
  }
  if(product && product.stock_status && !getProductVariants(product).length){ return product.stock_status; }
  var qty = getProductStockQuantity(product, null);
  if(qty <= 0) return 'sold_out';
  if(qty <= 5) return 'low_stock';
  return 'in_stock';
}

function getProductStockMessage(product, variant){
  if(variant){
    var variantQty = getProductStockQuantity(product, variant);
    if(variantQty <= 0) return 'SOLD OUT';
    if(variantQty <= 5) return 'Only ' + variantQty + ' remaining';
    return '';
  }
  if(product && product.stock_message && !getProductVariants(product).length){ return product.stock_message; }
  var qty = getProductStockQuantity(product, null);
  if(qty <= 0) return 'SOLD OUT';
  if(qty <= 5) return 'Only ' + qty + ' remaining';
  return '';
}

function isProductSoldOut(product, variant){
  return getProductStockStatus(product, variant) === 'sold_out';
}

function getProductUrl(id){
  return 'product.html?product=' + encodeURIComponent(id);
}

function getQuantityPricing(unitPrice, quantity){
  var parsedQty = parseInt(quantity, 10);
  var qty = Number.isFinite(parsedQty) ? Math.max(0, parsedQty) : 0;
  var normalTotal = unitPrice * qty;
  var discountSteps = Math.max(0, Math.min(qty - 1, 4));
  var discountRate = qty >= 10 ? 0.20 : discountSteps * 0.03;
  var discountedTotal = normalTotal * (1 - discountRate);
  return {
    qty: qty,
    normalTotal: normalTotal,
    discountedTotal: discountedTotal,
    hasDiscount: discountRate > 0
  };
}

function setDualPriceMarkup(priceEl, pricing){
  if(!priceEl) return;
  if(pricing.hasDiscount){
    priceEl.innerHTML = '<span class="price-normal">$' + pricing.normalTotal.toFixed(2) + '</span><span class="price-discount">$' + pricing.discountedTotal.toFixed(2) + '</span>';
    return;
  }
  priceEl.textContent = '$' + pricing.normalTotal.toFixed(2);
}

function formatMoney(value){
  return '$' + Number(value || 0).toFixed(2);
}

function renderSavingsRows(product){
  var rows = document.getElementById('productSavingsRows');
  if(!rows || !product) return;
  var levels = [1, 2, 3, 4, 5, '10+'];
  rows.innerHTML = levels.map(function(level){
    var qty = level === '10+' ? 10 : level;
    var pricing = getQuantityPricing(product.price, qty);
    var discountedLabel = level === '10+' ? ('$' + pricing.discountedTotal.toFixed(2) + '+') : ('$' + pricing.discountedTotal.toFixed(2));
    var percentSaved = pricing.normalTotal > 0 ? Math.round(((pricing.normalTotal - pricing.discountedTotal) / pricing.normalTotal) * 100) : 0;
    return '<tr><td>' + level + '</td><td>' + discountedLabel + '</td><td>' + percentSaved + '%</td></tr>';
  }).join('');
}

function toggleAddToCartOption(addBtn, quantity){
  if(!addBtn) return;
  var canAdd = quantity >= 1;
  addBtn.disabled = !canAdd;
}

function navigateToProductPage(id){
  if(!id) return;
  window.location.href = getProductUrl(id);
}

function getInitialProductSearchQuery(){
  try {
    var params = new URLSearchParams(window.location.search);
    return (params.get('q') || '').trim();
  } catch (err) {
    return '';
  }
}

function goToShopSearch(query){
  var term = (query || '').toString().trim();
  var target = 'shop.html' + (term ? ('?q=' + encodeURIComponent(term)) : '');
  window.location.href = target;
}

function escapeHtml(value){
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildProductDisclaimer(product){
  return [
    '<p>The products offered by PepX Research are intended strictly for laboratory research purposes only and are sold exclusively to qualified professionals, institutions, and entities. These products are not for human consumption, veterinary use, or any other application involving living organisms, including but not limited to diagnostic, therapeutic, or recreational purposes.</p>',
    '<p>By purchasing this product, you confirm that:</p>',
    '<ul><li>You are a qualified professional or entity with the necessary knowledge, training, and facilities to handle chemical reagents safely and appropriately.</li><li>You will use this product in full compliance with all applicable local, state, and federal laws and regulations.</li></ul>',
    '<h4>Prohibited Uses</h4>',
    '<ul><li>This product is not to be used as an active pharmaceutical ingredient (API) in compounding or manufacturing drugs for human or veterinary use.</li><li>It is strictly prohibited to use this product for administration to humans or animals under any circumstances.</li><li>PepX Research does not condone or permit the use of its products for the development, testing, or production of illegal substances.</li></ul>',
    '<h4>Regulatory Compliance</h4>',
    '<p>PepX Research does not claim that this product is approved by the U.S. Food and Drug Administration (FDA) for any purpose. The statements regarding this product have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.</p>',
    '<h4>Liability Statement</h4>',
    '<p>The buyer assumes full responsibility for ensuring the safe handling, storage, and use of this product. PepX Research is not liable for any damages, direct or indirect, resulting from improper handling, storage, or unauthorized use of this product. Furthermore, PepX Research reserves the right to refuse sales to any individual or entity suspected of misusing its products.</p>',
    '<p>If you have questions about the safe and lawful use of this product, consult a qualified professional with expertise in laboratory research. By proceeding with this purchase, you agree to these terms and conditions.</p>'
  ].join('');
}

function getUpsellProducts(product, limit){
  return PRODUCTS.filter(function(item){
    return item.id !== product.id && item.category !== product.category;
  }).slice(0, limit);
}

function getRelatedProducts(product, limit){
  var matches = PRODUCTS.filter(function(item){
    return item.id !== product.id && item.category === product.category;
  });
  if(matches.length >= limit) return matches.slice(0, limit);
  return matches.concat(PRODUCTS.filter(function(item){
    return item.id !== product.id && item.category !== product.category;
  })).slice(0, limit);
}

function renderProductCards(products, options){
  var settings = options || {};
  var viewLabel = settings.viewLabel || 'View Details';
  return products.map(function(p){
    var image = getProductImage(p);
    var variants = getProductVariants(p);
    var displayPrice = Number(p.price || 0);
    var displayPriceLabel = '$' + displayPrice.toFixed(2);
    if(variants.length){
      var minPrice = variants.reduce(function(min, v){
        var price = Number(v.price || 0);
        return price < min ? price : min;
      }, Number(variants[0].price || 0));
      var maxPrice = variants.reduce(function(max, v){
        var price = Number(v.price || 0);
        return price > max ? price : max;
      }, Number(variants[0].price || 0));
      displayPriceLabel = minPrice === maxPrice
        ? ('$' + minPrice.toFixed(2))
        : ('$' + minPrice.toFixed(2) + '-$' + maxPrice.toFixed(2));
    }
    var hasResolvedInventory = productsLoadedFromAPI;
    var stockMarkup = '<p class="stock-note loading">Checking availability...</p>';
    if(hasResolvedInventory){
      var stockStatus = getProductStockStatus(p);
      var stockMessage = getProductStockMessage(p);
      var stockClass = stockStatus === 'sold_out' ? 'stock-note sold-out' : (stockStatus === 'low_stock' ? 'stock-note low-stock' : 'stock-note');
      stockMarkup = stockMessage ? ('<p class="' + stockClass + '">' + escapeHtml(stockMessage) + '</p>') : '<p class="stock-note in-stock">In stock</p>';
    }
    return '<div class="product-card" data-id="'+p.id+'" role="button" tabindex="0">'+
      '<div class="product-card-media"><img src="'+image+'" alt="'+p.name+' product image" loading="lazy"></div><div class="product-card-body">'+
      '<div class="product-card-meta"><span class="price">'+displayPriceLabel+'</span></div>'+
      '<h3>'+getProductDisplayName(p)+'</h3>'+
      stockMarkup+
      '<div class="product-card-actions"><button class="btn ghost quick-btn" type="button" data-id="'+p.id+'">'+viewLabel+'</button></div>'+
      '</div></div>';
  }).join('');
}

function attachProductCardInteractions(container){
  if(!container) return;
  container.querySelectorAll('.product-card').forEach(function(card){
    card.addEventListener('click', function(e){
      if(e.target.closest('.quick-btn')) return;
      navigateToProductPage(card.getAttribute('data-id'));
    });
    card.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        navigateToProductPage(card.getAttribute('data-id'));
      }
    });
  });
  container.querySelectorAll('.quick-btn').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      navigateToProductPage(btn.getAttribute('data-id'));
    });
  });
}

function openProductModal(id){
  selectedProductId = id;
  var product = getProductById(id);
  if(!product) return;
  var modal = document.getElementById('productModal');
  if(!modal) return;
  document.getElementById('productModalTitle').textContent = product.name;
  document.getElementById('productModalTag').textContent = product.tag;
  var modalPriceEl = document.getElementById('productModalPrice');
  var modalAddBtn = document.getElementById('addProductModalBtn');
  var modalImage = modal.querySelector('.product-modal-image');
  var selectedVariant = getSelectedVariant(product);
  if(modalImage){
    modalImage.style.backgroundImage = 'url("' + getProductImage(product) + '")';
    modalImage.style.backgroundSize = 'cover';
    modalImage.style.backgroundPosition = 'center';
  }
  var descEl = modal.querySelector('.product-modal-description');
  if(descEl) descEl.textContent = product.description;

  var variantWrap = modal.querySelector('.product-modal-variant-wrap');
  if(!variantWrap){
    variantWrap = document.createElement('div');
    variantWrap.className = 'product-modal-variant-wrap';
    variantWrap.style.margin = '0 0 12px';
    if(descEl && descEl.parentNode){
      descEl.parentNode.insertBefore(variantWrap, descEl.nextSibling);
    }
  }

  var variants = getProductVariants(product);
  if(variants.length){
    variantWrap.innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:6px;">Dosage</div><div class="dose-options" id="productModalDoseOptions"></div>';
    var optionsWrap = variantWrap.querySelector('#productModalDoseOptions');
    variants.forEach(function(v){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dose-option' + (selectedVariant && Number(selectedVariant.id) === Number(v.id) ? ' active' : '');
      btn.textContent = v.name;
      btn.addEventListener('click', function(){
        product.selected_variant_id = Number(v.id);
        Array.prototype.forEach.call(optionsWrap.querySelectorAll('.dose-option'), function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        updateModalPrice();
      });
      optionsWrap.appendChild(btn);
    });
  } else {
    variantWrap.innerHTML = '';
  }

  var stockNoteEl = modal.querySelector('.product-stock-note');
  if(!stockNoteEl){
    stockNoteEl = document.createElement('p');
    stockNoteEl.className = 'product-stock-note';
    if(descEl && descEl.parentNode){
      descEl.parentNode.insertBefore(stockNoteEl, descEl.nextSibling);
    }
  }

  var qty = document.getElementById('productModalQty');
  function updateModalPrice(){
    if(!qty || !modalPriceEl) return;
    var selected = getSelectedVariant(product);
    var unitPrice = selected ? Number(selected.price || 0) : Number(product.price || 0);
    var stockQty = getProductStockQuantity(product, selected);
    var stockStatus = getProductStockStatus(product, selected);
    var stockMessage = getProductStockMessage(product, selected);

    if(stockNoteEl){
      stockNoteEl.textContent = stockMessage || 'In stock';
      stockNoteEl.classList.toggle('sold-out', stockStatus === 'sold_out');
      stockNoteEl.classList.toggle('low-stock', stockStatus === 'low_stock');
    }

    var maxQty = Math.max(0, stockQty);
    if(maxQty > 0){
      qty.max = String(maxQty);
      if(Number(qty.value) > maxQty){ qty.value = String(maxQty); }
    }
    var pricing = getQuantityPricing(unitPrice, qty.value);
    setDualPriceMarkup(modalPriceEl, pricing);
    var canAdd = pricing.qty >= 1 && !isProductSoldOut(product, selected) && pricing.qty <= maxQty;
    modalAddBtn.disabled = !canAdd;
  }
  if(qty){
    qty.value = '1';
    qty.oninput = updateModalPrice;
    qty.onchange = updateModalPrice;
  }
  updateModalPrice();
  modal.classList.add('show');
  document.getElementById('backdrop').classList.add('show');
}

function loadCart(){
  // Backend (/api/cart) is the single source of truth; do not hydrate from localStorage.
  cart = {};
  try { window.localStorage.removeItem(STORAGE_KEY); } catch (err) {}
}

function saveCart(){
  // No-op: cart is persisted server-side via /api/cart.
}

function shuffleProducts(products){
  var shuffled = products.slice();
  for(var i = shuffled.length - 1; i > 0; i -= 1){
    var swapIndex = Math.floor(Math.random() * (i + 1));
    var temp = shuffled[i];
    shuffled[i] = shuffled[swapIndex];
    shuffled[swapIndex] = temp;
  }
  return shuffled;
}

function getHomeFeaturedRowSize(){
  return 4;
}

function isHomepageFeaturedGrid(grid){
  if(!grid) return false;
  return !!grid.closest('#products') && !document.body.classList.contains('page-shop');
}

function selectHomepageFeaturedProducts(products){
  var rowSize = Math.min(getHomeFeaturedRowSize(), products.length);
  if(!homeFeaturedProductIds || homeFeaturedProductIds.length !== rowSize){
    homeFeaturedProductIds = shuffleProducts(products).slice(0, rowSize).map(function(item){ return item.id; });
  }

  var selected = homeFeaturedProductIds.map(function(id){
    return products.find(function(item){ return item.id === id; });
  }).filter(Boolean);

  if(selected.length < rowSize){
    var selectedIds = new Set(selected.map(function(item){ return item.id; }));
    var remaining = products.filter(function(item){ return !selectedIds.has(item.id); });
    selected = selected.concat(shuffleProducts(remaining).slice(0, rowSize - selected.length));
  }

  return selected;
}

function renderProducts(filter){
  var grid = document.getElementById('productGrid');
  if(!grid) return;
  var query = (filter || '').toLowerCase().trim();
  var visible = PRODUCTS.filter(function(p){
    var matchesText = !query || p.name.toLowerCase().includes(query) || p.tag.toLowerCase().includes(query) || p.description.toLowerCase().includes(query);
    var matchesCategory = activeCategory === 'all' || p.category === activeCategory;
    return matchesText && matchesCategory;
  });
  if(activeSort === 'priceAsc'){
    visible.sort(function(a,b){return a.price - b.price;});
  } else if(activeSort === 'priceDesc'){
    visible.sort(function(a,b){return b.price - a.price;});
  } else if(activeSort === 'nameAsc'){
    visible.sort(function(a,b){return a.name.localeCompare(b.name);});
  } else if(activeSort === 'nameDesc'){
    visible.sort(function(a,b){return b.name.localeCompare(a.name);});
  }

  if(isHomepageFeaturedGrid(grid)){
    visible = selectHomepageFeaturedProducts(visible);
  }

  grid.innerHTML = renderProductCards(visible, { viewLabel: 'View Details' });
  if(!visible.length){
    grid.innerHTML = '<div class="review-empty">No products match your search.</div>';
    return;
  }
  attachProductCardInteractions(grid);
}

function closeProductModal(){
  var modal = document.getElementById('productModal');
  if(modal) modal.classList.remove('show');
  var backdrop = document.getElementById('backdrop');
  if(backdrop) backdrop.classList.remove('show');
}

function renderProductRail(containerId, products){
  var container = document.getElementById(containerId);
  if(!container) return;
  container.innerHTML = renderProductCards(products, { viewLabel: 'View Details' });
  attachProductCardInteractions(container);
}

function renderHeroBestSellers(){
  var rail = document.getElementById('heroBestSellers');
  var prev = document.getElementById('heroBestPrev');
  var next = document.getElementById('heroBestNext');
  if(!rail || !prev || !next) return;
  if(heroBestSellersController && typeof heroBestSellersController.dispose === 'function'){
    heroBestSellersController.dispose();
  }
  var featured = PRODUCTS.slice(0, 6);
  if(!featured.length){
    rail.innerHTML = '';
    return;
  }

  var activeIndex = 0;
  var isAnimating = false;
  var transitionTimer = null;
  var unlockTimer = null;
  var autoRotateTimer = null;
  var destroyed = false;
  var TRANSITION_MS = 320;
  var AUTOPLAY_MS = 4200;

  function preloadProductImageByIndex(index){
    if(typeof Image === 'undefined') return;
    var product = featured[index];
    if(!product) return;
    var src = getProductImage(product);
    if(!src) return;
    var img = new Image();
    img.src = src;
  }

  function preloadAdjacentImages(){
    preloadProductImageByIndex((activeIndex + 1) % featured.length);
    preloadProductImageByIndex((activeIndex - 1 + featured.length) % featured.length);
  }

  function draw(){
    if(destroyed) return;
    var product = featured[activeIndex];
    if(!product) return;
    rail.innerHTML = renderProductCards([product], { viewLabel: 'View Details' });
    attachProductCardInteractions(rail);
    preloadAdjacentImages();
  }

  function clearAnimationClasses(){
    rail.classList.remove('is-exit-left', 'is-exit-right', 'is-enter-left', 'is-enter-right');
  }

  function animateTo(delta){
    if(destroyed || isAnimating || featured.length < 2) return;
    isAnimating = true;

    var exitClass = delta > 0 ? 'is-exit-left' : 'is-exit-right';
    var enterClass = delta > 0 ? 'is-enter-right' : 'is-enter-left';

    clearAnimationClasses();
    rail.classList.add(exitClass);

    if(transitionTimer){ window.clearTimeout(transitionTimer); }
    if(unlockTimer){ window.clearTimeout(unlockTimer); }

    transitionTimer = window.setTimeout(function(){
      if(destroyed) return;
      var nextIndex = (activeIndex + delta + featured.length) % featured.length;
      if(!featured[nextIndex]){
        clearAnimationClasses();
        isAnimating = false;
        return;
      }
      activeIndex = nextIndex;
      draw();
      clearAnimationClasses();
      rail.classList.add(enterClass);
      // Force reflow so removing enter class triggers a smooth transition to default state.
      rail.offsetWidth;
      rail.classList.remove(enterClass);

      unlockTimer = window.setTimeout(function(){
        if(destroyed) return;
        isAnimating = false;
      }, TRANSITION_MS);
    }, TRANSITION_MS);
  }

  function stopAutoRotate(){
    if(autoRotateTimer){
      window.clearInterval(autoRotateTimer);
      autoRotateTimer = null;
    }
  }

  function startAutoRotate(){
    stopAutoRotate();
    if(featured.length < 2) return;
    autoRotateTimer = window.setInterval(function(){
      if(document.hidden) return;
      animateTo(1);
    }, AUTOPLAY_MS);
  }

  function restartAutoRotate(){
    startAutoRotate();
  }

  function onPrevClick(){
    animateTo(-1);
    restartAutoRotate();
  }

  function onNextClick(){
    animateTo(1);
    restartAutoRotate();
  }

  prev.addEventListener('click', onPrevClick);
  next.addEventListener('click', onNextClick);

  var heroBest = rail.closest('.hero-best');
  var onMouseEnter = null;
  var onMouseLeave = null;
  var onFocusIn = null;
  var onFocusOut = null;
  if(heroBest){
    onMouseEnter = stopAutoRotate;
    onMouseLeave = startAutoRotate;
    onFocusIn = stopAutoRotate;
    onFocusOut = function(event){
      if(heroBest.contains(event.relatedTarget)) return;
      startAutoRotate();
    };
    heroBest.addEventListener('mouseenter', onMouseEnter);
    heroBest.addEventListener('mouseleave', onMouseLeave);
    heroBest.addEventListener('focusin', onFocusIn);
    heroBest.addEventListener('focusout', onFocusOut);
  }

  function onVisibilityChange(){
    if(destroyed) return;
    if(document.hidden){
      stopAutoRotate();
      return;
    }
    startAutoRotate();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);

  heroBestSellersController = {
    dispose: function(){
      if(destroyed) return;
      destroyed = true;
      stopAutoRotate();
      if(transitionTimer){ window.clearTimeout(transitionTimer); transitionTimer = null; }
      if(unlockTimer){ window.clearTimeout(unlockTimer); unlockTimer = null; }
      clearAnimationClasses();
      prev.removeEventListener('click', onPrevClick);
      next.removeEventListener('click', onNextClick);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if(heroBest){
        if(onMouseEnter){ heroBest.removeEventListener('mouseenter', onMouseEnter); }
        if(onMouseLeave){ heroBest.removeEventListener('mouseleave', onMouseLeave); }
        if(onFocusIn){ heroBest.removeEventListener('focusin', onFocusIn); }
        if(onFocusOut){ heroBest.removeEventListener('focusout', onFocusOut); }
      }
    }
  };

  draw();
  startAutoRotate();
}

function setProductDetailLoadingState(page, lookup){
  if(!page) return;
  var shell = page.querySelector('.product-detail-shell');
  if(shell){ shell.classList.add('is-loading'); }

  var titleEl = document.getElementById('productDetailTitle');
  var tagEl = document.getElementById('productDetailTag');
  var priceEl = document.getElementById('productDetailPrice');
  var breadcrumbEl = document.getElementById('productDetailBreadcrumb');
  var summaryEl = document.getElementById('productDetailSummary');
  var stockInfoEl = document.getElementById('productDetailStockMessage');
  var qtyEl = document.getElementById('productDetailQty');
  var addBtn = document.getElementById('productDetailAddBtn');
  var checkoutBtn = document.getElementById('productDetailCheckoutBtn');
  var doseOptionsContainer = document.getElementById('productDetailDoseOptions');
  var savingsRows = document.getElementById('productSavingsRows');
  var descPanel = document.getElementById('productTabPanel');
  var detailMedia = page.querySelector('.product-detail-media');
  var upsellGrid = document.getElementById('upsellGrid');
  var relatedGrid = document.getElementById('relatedGrid');

  if(titleEl){ titleEl.textContent = 'Loading product...'; }
  if(tagEl){ tagEl.textContent = 'Loading'; }
  if(priceEl){ priceEl.textContent = '...'; }
  if(breadcrumbEl){ breadcrumbEl.textContent = lookup ? 'Loading' : 'Product'; }
  if(summaryEl){ summaryEl.textContent = 'Fetching product details and availability...'; }
  if(descPanel){ descPanel.innerHTML = '<p>Loading product information...</p>'; }
  if(doseOptionsContainer){ doseOptionsContainer.innerHTML = ''; }
  if(savingsRows){ savingsRows.innerHTML = '<tr><td colspan="3">Loading pricing...</td></tr>'; }
  if(upsellGrid){ upsellGrid.innerHTML = ''; }
  if(relatedGrid){ relatedGrid.innerHTML = ''; }

  if(detailMedia){
    detailMedia.classList.remove('has-product-image');
    detailMedia.style.backgroundImage = '';
  }

  if(!stockInfoEl && summaryEl && summaryEl.parentNode){
    stockInfoEl = document.createElement('p');
    stockInfoEl.id = 'productDetailStockMessage';
    stockInfoEl.className = 'product-stock-note loading';
    summaryEl.parentNode.insertBefore(stockInfoEl, summaryEl.nextSibling);
  }
  if(stockInfoEl){
    stockInfoEl.textContent = 'Checking availability...';
    stockInfoEl.classList.remove('sold-out', 'low-stock');
    stockInfoEl.classList.add('loading');
  }

  if(qtyEl){
    qtyEl.value = '1';
    qtyEl.disabled = true;
  }
  if(addBtn){ addBtn.disabled = true; }
  if(checkoutBtn){ checkoutBtn.disabled = true; }
}

function setProductDetailErrorState(page, message){
  if(!page) return;
  var shell = page.querySelector('.product-detail-shell');
  if(shell){ shell.classList.remove('is-loading'); }

  var titleEl = document.getElementById('productDetailTitle');
  var tagEl = document.getElementById('productDetailTag');
  var priceEl = document.getElementById('productDetailPrice');
  var breadcrumbEl = document.getElementById('productDetailBreadcrumb');
  var summaryEl = document.getElementById('productDetailSummary');
  var stockInfoEl = document.getElementById('productDetailStockMessage');
  var descPanel = document.getElementById('productTabPanel');
  var qtyEl = document.getElementById('productDetailQty');
  var addBtn = document.getElementById('productDetailAddBtn');
  var checkoutBtn = document.getElementById('productDetailCheckoutBtn');
  var savingsRows = document.getElementById('productSavingsRows');
  var detailMedia = page.querySelector('.product-detail-media');

  if(titleEl){ titleEl.textContent = 'Product unavailable'; }
  if(tagEl){ tagEl.textContent = 'Unavailable'; }
  if(priceEl){ priceEl.textContent = ''; }
  if(breadcrumbEl){ breadcrumbEl.textContent = 'Unavailable'; }
  if(summaryEl){ summaryEl.textContent = message || 'We could not load this product.'; }
  if(descPanel){ descPanel.innerHTML = '<p>' + escapeHtml(message || 'We could not load this product.') + '</p>'; }
  if(savingsRows){ savingsRows.innerHTML = '<tr><td colspan="3">Unavailable</td></tr>'; }

  if(detailMedia){
    detailMedia.classList.remove('has-product-image');
    detailMedia.style.backgroundImage = '';
  }

  if(stockInfoEl){
    stockInfoEl.textContent = '';
    stockInfoEl.classList.remove('loading', 'sold-out', 'low-stock');
  }

  if(qtyEl){ qtyEl.disabled = true; }
  if(addBtn){ addBtn.disabled = true; }
  if(checkoutBtn){ checkoutBtn.disabled = true; }
}

function renderProductDetailPage(){
  var page = document.querySelector('[data-product-detail-page]');
  if(!page) return;
  var renderToken = ++productDetailRenderToken;

  var params = new URLSearchParams(window.location.search);
  var productLookup = (params.get('product') || params.get('slug') || '').trim();

  if(!productLookup){
    setProductDetailErrorState(page, 'No product was specified in the URL.');
    return;
  }

  if(!productsLoadedFromAPI){
    setProductDetailLoadingState(page, productLookup);
    loadProductsFromAPI().then(function(){
      if(renderToken !== productDetailRenderToken) return;
      renderProductDetailPage();
    }).catch(function(){
      if(renderToken !== productDetailRenderToken) return;
      setProductDetailErrorState(page, 'We could not load this product right now. Please refresh and try again.');
    });
    return;
  }

  var product = getProductById(productLookup);
  if(!product){
    setProductDetailErrorState(page, 'That product could not be found.');
    return;
  }

  var shell = page.querySelector('.product-detail-shell');
  if(shell){ shell.classList.remove('is-loading'); }
  var titleEl = document.getElementById('productDetailTitle');
  var tagEl = document.getElementById('productDetailTag');
  var priceEl = document.getElementById('productDetailPrice');
  var breadcrumbEl = document.getElementById('productDetailBreadcrumb');
  var summaryEl = document.getElementById('productDetailSummary');
  var descPanel = document.getElementById('productTabPanel');
  var qtyEl = document.getElementById('productDetailQty');
  var addBtn = document.getElementById('productDetailAddBtn');
  var checkoutBtn = document.getElementById('productDetailCheckoutBtn');
  var selectedVariant = getSelectedVariant(product);

  var stockInfoEl = document.getElementById('productDetailStockMessage');
  if(!stockInfoEl && summaryEl && summaryEl.parentNode){
    stockInfoEl = document.createElement('p');
    stockInfoEl.id = 'productDetailStockMessage';
    stockInfoEl.className = 'product-stock-note';
    summaryEl.parentNode.insertBefore(stockInfoEl, summaryEl.nextSibling);
  }

  var doseOptionsContainer = document.getElementById('productDetailDoseOptions');
  var detailMedia = page.querySelector('.product-detail-media');
  var disclaimerContent = buildProductDisclaimer(product);

  if(doseOptionsContainer){
    doseOptionsContainer.innerHTML = '';
    var variants = getProductVariants(product);

    if(variants.length > 0){
      variants.forEach(function(variant, idx){
        var btn = document.createElement('button');
        btn.type = 'button';
        var isActive = selectedVariant
          ? Number(selectedVariant.id) === Number(variant.id)
          : idx === 0;
        btn.className = 'dose-option' + (isActive ? ' active' : '');
        btn.textContent = variant.name;
        btn.dataset.value = variant.name;
        btn.addEventListener('click', function(){
          doseOptionsContainer.querySelectorAll('.dose-option').forEach(function(b){ b.classList.remove('active'); });
          btn.classList.add('active');
          product.selected_variant_id = Number(variant.id);
          selectedVariant = getSelectedVariant(product);
          updateDetailPrice();
        });
        doseOptionsContainer.appendChild(btn);
      });
      if(selectedVariant){
        product.selectedDose = selectedVariant.name;
      }
      if(!selectedVariant && variants[0]){
        product.selected_variant_id = Number(variants[0].id);
        selectedVariant = getSelectedVariant(product);
      }
    } else {
      product.selectedDose = '';
    }
  }

  document.title = product.name + ' | PepX Research Chemicals';
  var displayName = product.name;
  if(product.id === 'klow_80'){
    if(titleEl) titleEl.innerHTML = 'KLOW<br><span style="font-size:0.6em;font-weight:normal;color:#666;">KPV10mg+BPC10mg+GHK-Cu50mg+TB500 10mg</span>';
    displayName = 'KLOW';
  } else {
    if(titleEl) titleEl.textContent = displayName;
  }
  if(tagEl) tagEl.textContent = product.tag;
  if(breadcrumbEl) breadcrumbEl.textContent = displayName;
  if(summaryEl) summaryEl.textContent = product.description;
  if(stockInfoEl){
    var stockStatus = getProductStockStatus(product, selectedVariant);
    var stockMessage = getProductStockMessage(product, selectedVariant);
    stockInfoEl.textContent = stockMessage || 'In stock';
    stockInfoEl.classList.remove('loading');
    stockInfoEl.classList.toggle('sold-out', stockStatus === 'sold_out');
    stockInfoEl.classList.toggle('low-stock', stockStatus === 'low_stock');
  }
  renderSavingsRows(product);
  if(detailMedia){
    detailMedia.classList.add('has-product-image');
    detailMedia.style.backgroundImage = 'url("' + getProductImage(product) + '")';
    detailMedia.style.backgroundSize = 'cover';
    detailMedia.style.backgroundPosition = 'center';
  }

  function updateDetailPrice(){
    if(!priceEl) return;
    selectedVariant = getSelectedVariant(product);
    var unitPrice = selectedVariant ? Number(selectedVariant.price || 0) : Number(product.price || 0);
    var stockQty = getProductStockQuantity(product, selectedVariant);
    var stockStatus = getProductStockStatus(product, selectedVariant);
    var stockMessage = getProductStockMessage(product, selectedVariant);

    if(stockInfoEl){
      stockInfoEl.textContent = stockMessage || 'In stock';
      stockInfoEl.classList.remove('loading');
      stockInfoEl.classList.toggle('sold-out', stockStatus === 'sold_out');
      stockInfoEl.classList.toggle('low-stock', stockStatus === 'low_stock');
    }

    if(qtyEl){
      if(stockQty > 0){
        qtyEl.max = String(stockQty);
        if(Number(qtyEl.value) > stockQty){ qtyEl.value = String(stockQty); }
      }
    }
    var pricing = getQuantityPricing(unitPrice, qtyEl ? qtyEl.value : 1);
    setDualPriceMarkup(priceEl, pricing);
    renderSavingsRows({ price: unitPrice });
    var canAdd = pricing.qty >= 1 && !isProductSoldOut(product, selectedVariant) && pricing.qty <= Math.max(0, stockQty);
    if(addBtn){ addBtn.disabled = !canAdd; }
    if(checkoutBtn){ checkoutBtn.disabled = isProductSoldOut(product, selectedVariant); }
  }

  if(qtyEl){
    qtyEl.oninput = updateDetailPrice;
    qtyEl.onchange = updateDetailPrice;
  }
  updateDetailPrice();

  if(descPanel){
    descPanel.innerHTML = disclaimerContent || '';
  }

  function addDetailProductToCart(){
    var qty = qtyEl ? Math.max(0, parseInt(qtyEl.value, 10) || 0) : 0;
    selectedVariant = getSelectedVariant(product);
    var stockQty = getProductStockQuantity(product, selectedVariant);
    if(qty < 1) return false;
    if(getProductVariants(product).length && !selectedVariant){
      showToast('Please select a dosage option.');
      return false;
    }
    if(isProductSoldOut(product, selectedVariant)){
      showToast('SOLD OUT');
      return false;
    }
    if(qty > stockQty){
      showToast('Only ' + stockQty + ' remaining in stock.');
      return false;
    }
    authApi('/api/cart',{
      method:'POST',
      body:JSON.stringify({
        product_id:product.id,
        variant_id:selectedVariant ? selectedVariant.id : null,
        quantity:qty
      })
    })
      .then(function(){
        var productName = product.name;
        if(selectedVariant){
          productName += ' (' + selectedVariant.name + ')';
        }
        showToast(qty + ' × ' + productName + ' added to cart');
        return loadBackendCart();
      })
      .catch(function(err){ showToast(err.message||'Could not add to cart'); });
    return true;
  }

  if(addBtn){
    addBtn.onclick = function(){
      addDetailProductToCart();
    };
  }

  if(checkoutBtn){
    checkoutBtn.onclick = function(){
      if(addDetailProductToCart()){
        /* transferGuestCartCheckoutGate: require login before checkout */
        if(!currentAuthSession){
          showToast('Please log in or create an account to checkout.');
          openAuthModal('login');
          return;
        }
        window.location.href = 'checkout.html';
      }
    };
  }

  renderProductRail('upsellGrid', getUpsellProducts(product, 3));
  renderProductRail('relatedGrid', getRelatedProducts(product, 3));
}

function addSelectedProductToCart(){
  if(!selectedProductId) return;
  var product = getProductById(selectedProductId);
  if(!product) return;
  var selectedVariant = getSelectedVariant(product);
  var stockQty = getProductStockQuantity(product, selectedVariant);
  var qty = parseInt(document.getElementById('productModalQty').value, 10) || 0;
  if(qty < 1) return;
  if(getProductVariants(product).length && !selectedVariant){
    showToast('Please select a dosage option.');
    return;
  }
  if(isProductSoldOut(product, selectedVariant)){
    showToast('SOLD OUT');
    return;
  }
  if(qty > stockQty){
    showToast('Only ' + stockQty + ' remaining in stock.');
    return;
  }
  authApi('/api/cart',{
    method:'POST',
    body:JSON.stringify({
      product_id:selectedProductId,
      variant_id:selectedVariant ? selectedVariant.id : null,
      quantity:qty
    })
  })
    .then(function(){
      var label = selectedVariant ? (' (' + selectedVariant.name + ')') : '';
      showToast('Added ' + qty + ' item(s) to cart' + label);
      closeProductModal();
      saveCart();
      return loadBackendCart();
    })
    .catch(function(err){ showToast(err.message||'Could not add to cart'); });
}

// ---------- Cart ----------
// --- Backend cart integration: backend is the source of truth ---
function loadBackendCart(){
  return authApi("/api/cart", { method: "GET" }).then(function(data){
    cartData = { items: (data && data.items) ? data.items : [], total: (data && data.total) ? data.total : 0 };
    // Rebuild local maps keyed by cart-item id to support multiple variants per product.
    cart = {};
    cartItemIndex = {};
    cartData.items.forEach(function(it){
      cart[it.id] = it.quantity;
      cartItemIndex[it.id] = it.id;
      // Ensure the product exists in PRODUCTS so renderCart can resolve name/price/image.
      var exists = PRODUCTS.find(function(x){ return Number(x.id) === Number(it.product_id); });
      if(!exists){
        PRODUCTS.push({ id: it.product_id, name: it.name, price: Number(it.price), image: it.image_url, category: it.category, stock_quantity: Number(it.stock_quantity || 0), variants: [] });
      } else {
        exists.stock_quantity = Number(it.stock_quantity || exists.stock_quantity || 0);
      }
    });
    renderCart();
    return cartData;
  }).catch(function(){
    cartData = { items: [], total: 0 };
    cart = {};
    cartItemIndex = {};
    renderCart();
    return cartData;
  });
}

function addToCart(id){
  var p = PRODUCTS.find(function(x){return Number(x.id)===Number(id);});
  return authApi('/api/cart', { method: 'POST', body: JSON.stringify({ product_id: id, quantity: 1 }) }).then(function(){
    if(p){ showToast(p.name + ' added to cart'); } else { showToast('Added to cart'); }
    return loadBackendCart();
  }).catch(function(err){ showToast(err.message || 'Could not add to cart'); });
}

function isCartItemPending(itemId){
  return !!cartItemPendingMap[String(itemId)];
}

function setCartItemPending(itemId, pending){
  if(pending){
    cartItemPendingMap[String(itemId)] = true;
  } else {
    delete cartItemPendingMap[String(itemId)];
  }
}

function hasAnyCartItemPending(){
  return Object.keys(cartItemPendingMap).length > 0;
}

function getCartItemLabel(item){
  if(!item) return 'item';
  var name = String(item.name || 'Product');
  if(item.variant_name){
    name += ' (' + item.variant_name + ')';
  }
  return name;
}

function announceCartLive(message){
  var region = document.getElementById('cartLiveRegion');
  if(!region || !message) return;
  region.textContent = '';
  window.setTimeout(function(){
    region.textContent = message;
  }, 20);
}

function toggleCheckoutEmptyState(hasItems){
  var checkoutPage = document.querySelector('.page-checkout');
  var checkoutLayout = document.querySelector('.page-checkout .checkout-layout');
  var emptyState = document.getElementById('checkoutEmptyState');
  var cartShell = document.getElementById('checkoutCartShell');
  var flowCards = document.getElementById('checkoutFlowCards');
  var side = document.getElementById('checkoutSide');
  if(checkoutPage){ checkoutPage.classList.toggle('is-empty-cart', !hasItems); }
  if(checkoutLayout){ checkoutLayout.classList.toggle('is-empty', !hasItems); }
  if(emptyState){ emptyState.style.display = hasItems ? 'none' : ''; }
  if(cartShell){ cartShell.style.display = hasItems ? '' : 'none'; }
  if(flowCards){ flowCards.style.display = hasItems ? '' : 'none'; }
  if(side){ side.style.display = hasItems ? '' : 'none'; }
}

function updateCheckoutActionState(hasItems){
  var checkoutBtn = document.getElementById('checkoutBtn');
  if(!checkoutBtn) return;
  if(!checkoutBtn.getAttribute('data-default-label')){
    checkoutBtn.setAttribute('data-default-label', checkoutBtn.textContent || 'Place Order');
  }
  var shouldDisable = !hasItems || checkoutState.promoValidating || hasAnyCartItemPending();
  checkoutBtn.disabled = shouldDisable;
  checkoutBtn.classList.toggle('is-disabled', shouldDisable);
}

function syncPromoAppliedState(){
  var wrap = document.getElementById('checkoutPromoApplied');
  var codeEl = document.getElementById('checkoutPromoAppliedCode');
  if(!wrap || !codeEl) return;
  if(checkoutState.appliedPromoCode){
    codeEl.textContent = 'Applied: ' + checkoutState.appliedPromoCode;
    wrap.style.display = '';
  } else {
    codeEl.textContent = '';
    wrap.style.display = 'none';
  }
}

function changeQty(id, delta){
  var itemId = cartItemIndex[id] || id;
  if(isCartItemPending(itemId)){ return Promise.resolve(); }
  var currentItem = (cartData.items || []).find(function(it){ return Number(it.id) === Number(itemId); });
  if(!currentItem){ return Promise.resolve(); }
  var current = cart[itemId] || 0;
  var next = current + delta;
  if(next <= 0){ return removeItem(id); }
  var stockLimit = Number(currentItem.stock_quantity || 0);
  if(stockLimit > 0 && next > stockLimit){
    var limitMsg = 'Only ' + stockLimit + ' remaining in stock.';
    showToast(limitMsg);
    announceCartLive(limitMsg);
    return Promise.resolve();
  }

  setCartItemPending(itemId, true);
  renderCart();
  return authApi('/api/cart/item/' + itemId, { method: 'PUT', body: JSON.stringify({ quantity: next }) }).then(function(){
    return loadBackendCart();
  }).then(function(){
    var updated = (cartData.items || []).find(function(it){ return Number(it.id) === Number(itemId); });
    if(updated){
      announceCartLive(getCartItemLabel(updated) + ' quantity updated to ' + Number(updated.quantity || 0) + '.');
    }
  }).catch(function(err){
    var msg = (err && err.message) || 'Could not update cart';
    showToast(msg);
    announceCartLive(msg);
  }).finally(function(){
    setCartItemPending(itemId, false);
    renderCart();
  });
}
function removeItem(id){
  var itemId = cartItemIndex[id] || id;
  if(isCartItemPending(itemId)){ return Promise.resolve(); }
  if(!itemId){ delete cart[id]; renderCart(); return; }
  var toRemove = (cartData.items || []).find(function(it){ return Number(it.id) === Number(itemId); });
  var removedLabel = getCartItemLabel(toRemove);
  setCartItemPending(itemId, true);
  renderCart();
  return authApi('/api/cart/item/' + itemId, { method: 'DELETE' }).then(function(){
    return loadBackendCart();
  }).then(function(){
    announceCartLive(removedLabel + ' removed from your cart.');
  }).catch(function(err){
    var msg = (err && err.message) || 'Could not remove item';
    showToast(msg);
    announceCartLive(msg);
  }).finally(function(){
    setCartItemPending(itemId, false);
    renderCart();
  });
}

function ensureCartDrawer(){
  var cartBtn = document.getElementById('cartBtn');
  var drawer = document.getElementById('drawer');
  if(!drawer && !cartBtn) return null;
  if(!drawer){
    drawer = document.createElement('aside');
    drawer.id = 'drawer';
    document.body.appendChild(drawer);
  }
  if(!drawer.hasAttribute('data-mini-cart-ready')){
    drawer.className = 'drawer mini-cart';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'miniCartHeading');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.tabIndex = -1;
    drawer.innerHTML = ''+
      '<div class="drawer-head">'+
        '<h2 id="miniCartHeading">Your Cart</h2>'+
        '<button type="button" class="x" id="closeCart" aria-label="Close cart">&times;</button>'+
      '</div>'+
      '<div class="mini-cart-progress" id="miniCartFreeShipPanel">'+
        '<p id="miniCartFreeShipMessage">Add ' + formatMoney(FREE_SHIPPING_THRESHOLD) + ' more to get free shipping!</p>'+
        '<div class="mini-cart-progress-track" aria-hidden="true"><span id="miniCartFreeShipBar"></span></div>'+
      '</div>'+
      '<div class="drawer-body" id="cartBody"><p class="cart-empty">Your cart is empty.</p></div>'+
      '<div class="drawer-foot">'+
        '<div class="tot"><span>Subtotal</span><span id="cartTotal">$0.00</span></div>'+
        '<div class="cart-savings" id="cartSavings" style="display:none;">You saved $0.00</div>'+
        '<div class="mini-cart-actions">'+
          '<a class="btn ghost mini-cart-view" id="miniCartViewBtn" href="checkout.html">View Cart</a>'+
          '<button class="btn primary co" id="miniCartCheckoutBtn" type="button">Checkout</button>'+
        '</div>'+
      '</div>';
    drawer.setAttribute('data-mini-cart-ready', '1');
  }

  var overlay = document.getElementById('cartOverlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'cartOverlay';
    overlay.className = 'cart-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
  }
  return drawer;
}

function getMiniCartFocusable(){
  var drawer = document.getElementById('drawer');
  if(!drawer) return [];
  return Array.prototype.slice.call(drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(function(el){
    return !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden');
  });
}

function syncMiniCartBodyLock(){
  var drawer = document.getElementById('drawer');
  var isOpen = !!(drawer && drawer.classList.contains('open'));
  document.body.classList.toggle('cart-open', isOpen);
}

function updateFreeShippingProgress(subtotal){
  var messageEl = document.getElementById('miniCartFreeShipMessage');
  var barEl = document.getElementById('miniCartFreeShipBar');
  var checkoutMessageEl = document.getElementById('checkoutFreeShipMessage');
  var checkoutBarEl = document.getElementById('checkoutFreeShipBar');
  var checkoutPanel = document.getElementById('checkoutFreeShipPanel');
  var safeSubtotal = Math.max(0, Number(subtotal || 0));
  var remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - safeSubtotal);
  var progress = FREE_SHIPPING_THRESHOLD > 0 ? Math.min(1, safeSubtotal / FREE_SHIPPING_THRESHOLD) : 1;
  if(checkoutPanel){ checkoutPanel.style.display = FREE_SHIPPING_THRESHOLD > 0 ? '' : 'none'; }
  if(FREE_SHIPPING_THRESHOLD <= 0) return;
  var qualified = remaining <= 0;
  var message = qualified
    ? '\uD83C\uDF89 Your order qualifies for FREE Shipping!'
    : ('\uD83D\uDE9A You\'re only ' + formatMoney(remaining) + ' away from FREE Shipping!');

  if(messageEl){ messageEl.textContent = message; }
  if(barEl){
    barEl.style.width = (progress * 100).toFixed(2) + '%';
    barEl.parentElement.classList.toggle('is-qualified', qualified);
  }
  if(checkoutMessageEl){ checkoutMessageEl.textContent = message; }
  if(checkoutBarEl){
    checkoutBarEl.style.width = (progress * 100).toFixed(2) + '%';
    checkoutBarEl.parentElement.classList.toggle('is-qualified', qualified);
  }
}

function handleMiniCartKeydown(e){
  var drawer = document.getElementById('drawer');
  if(!drawer || !drawer.classList.contains('open')) return;

  if(e.key === 'Escape'){
    e.preventDefault();
    closeCart();
    return;
  }

  if(e.key !== 'Tab') return;

  var focusable = getMiniCartFocusable();
  if(!focusable.length){
    e.preventDefault();
    drawer.focus();
    return;
  }

  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if(e.shiftKey){
    if(document.activeElement === first || document.activeElement === drawer){
      e.preventDefault();
      last.focus();
    }
    return;
  }
  if(document.activeElement === last){
    e.preventDefault();
    first.focus();
  }
}

function initMiniCartControls(){
  var cartBtn = document.getElementById('cartBtn');
  if(!cartBtn) return;
  ensureCartDrawer();
  cartBtn.addEventListener('click', function(e){
    e.preventDefault();
    miniCartFocusReturnEl = cartBtn;
    openCart();
  });

  var closeCartBtn = document.getElementById('closeCart');
  if(closeCartBtn){ closeCartBtn.addEventListener('click', closeCart); }

  var overlay = document.getElementById('cartOverlay');
  if(overlay){ overlay.addEventListener('click', closeCart); }

  var checkoutBtn = document.getElementById('miniCartCheckoutBtn');
  if(checkoutBtn){
    checkoutBtn.addEventListener('click', function(){
      closeCart();
      window.location.href = 'checkout.html';
    });
  }
}

function renderCart(){
  ensureCartDrawer();
  var body = document.getElementById('cartBody');
  var checkout = document.getElementById('checkoutCart');
  var checkoutPage = document.querySelector('.page-checkout');
  var items = (cartData && Array.isArray(cartData.items)) ? cartData.items : [];
  var count = 0, total = 0, fullTotal = 0;
  items.forEach(function(item){
    var qty = Number(item.quantity || 0);
    var unitPrice = Number(item.price || 0);
    var pricing = getQuantityPricing(unitPrice, qty);
    count += pricing.qty;
    total += pricing.discountedTotal;
    fullTotal += pricing.normalTotal;
  });
  var badge = document.getElementById('cartCount');
  if(badge){
    badge.textContent = count;
    badge.style.display = count>0 ? 'flex' : 'none';
  }
  var countText = document.getElementById('checkoutItemCountText');
  if(countText){
    countText.textContent = count === 1 ? '1 item' : (count + ' items');
  }
  var promoDiscount = 0;
  if (checkoutState.appliedPromo && Number(checkoutState.appliedPromo.discount || 0) > 0) {
    var promoSubtotal = Number(checkoutState.appliedPromo.subtotal || 0);
    // If cart content changed after promo validation, clear promo state.
    if (Math.abs(promoSubtotal - total) > 0.009) {
      checkoutState.appliedPromo = null;
      checkoutState.appliedPromoCode = null;
      var staleMsg = document.getElementById('promoCodeMessage');
      if (staleMsg) {
        staleMsg.textContent = 'Cart updated. Please re-apply your discount code.';
      }
    } else {
      promoDiscount = Number(checkoutState.appliedPromo.discount || 0);
    }
  }

  var effectiveSubtotal = Math.max(0, total - promoDiscount);
  // Recompute shipping cost on every cart update so it always reflects the current subtotal.
  if(checkoutState.selectedRate && items.length > 0){
    var isGroundAdv = checkoutState.selectedRate.canonicalService === 'USPS Ground Advantage';
    checkoutState.shippingCost = (effectiveSubtotal >= FREE_SHIPPING_THRESHOLD && isGroundAdv) ? 0 : Number(checkoutState.selectedRate.price || 0);
  } else {
    checkoutState.shippingCost = items.length > 0 ? (effectiveSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_RATE) : 0;
  }
  var finalTotal = effectiveSubtotal + Number(checkoutState.shippingCost || 0);
  updateFreeShippingProgress(effectiveSubtotal);

  var totalEl = document.getElementById('cartTotal');
  if(totalEl){ totalEl.textContent = formatMoney(effectiveSubtotal); }
  var checkoutTotalEl = document.getElementById('checkoutTotal');
  if(checkoutTotalEl){ checkoutTotalEl.textContent = formatMoney(finalTotal); }
  var checkoutSubtotalEl = document.getElementById('checkoutSubtotal');
  if(checkoutSubtotalEl){ checkoutSubtotalEl.textContent = formatMoney(total); }
  var checkoutPromoRow = document.getElementById('checkoutPromoRow');
  var checkoutPromoDiscount = document.getElementById('checkoutPromoDiscount');
  if (checkoutPromoRow && checkoutPromoDiscount) {
    if (promoDiscount > 0) {
      checkoutPromoRow.style.display = '';
      checkoutPromoDiscount.textContent = '-' + formatMoney(promoDiscount);
    } else {
      checkoutPromoRow.style.display = 'none';
      checkoutPromoDiscount.textContent = '-' + formatMoney(0);
    }
  }
  var checkoutShippingEl = document.getElementById('checkoutShipping');
  if(checkoutShippingEl){
    if(items.length > 0 && Number(checkoutState.shippingCost || 0) === 0){
      checkoutShippingEl.innerHTML = '<span class="shipping-free-badge">FREE</span>';
    } else {
      checkoutShippingEl.textContent = formatMoney(Number(checkoutState.shippingCost || 0));
    }
  }
  var savingsEl = document.getElementById('cartSavings');
  var savedAmount = Math.max(0, fullTotal - total);
  if(savingsEl){
    if(savedAmount > 0.004){
      savingsEl.textContent = 'You saved ' + formatMoney(savedAmount);
      savingsEl.style.display = 'block';
    } else {
      savingsEl.style.display = 'none';
    }
  }

  syncPromoAppliedState();
  updateCheckoutActionState(items.length > 0);

  if(checkoutPage){
    toggleCheckoutEmptyState(items.length > 0);
    var totalAnnouncement = 'Estimated total ' + formatMoney(finalTotal) + ' for ' + count + (count === 1 ? ' item.' : ' items.');
    if(totalAnnouncement !== lastAnnouncedTotalsText){
      lastAnnouncedTotalsText = totalAnnouncement;
      announceCartLive(totalAnnouncement);
    }
  }

  if(!items.length){
    if(body) body.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    if(checkout) checkout.innerHTML = '';
    var miniCheckout = document.getElementById('miniCartCheckoutBtn');
    if(miniCheckout){ miniCheckout.disabled = true; }
    return;
  }
  var drawerItemsHtml = items.map(function(item){
    var itemId = Number(item.id);
    var qty = Number(item.quantity || 0);
    var pricing = getQuantityPricing(Number(item.price || 0), qty);
    var imageUrl = item.image_url || DEFAULT_PRODUCT_IMAGE_URL;
    var displayName = String(item.name || 'Product');
    if(item.variant_name){
      displayName += ' (' + item.variant_name + ')';
    }
    var linePriceMarkup = pricing.hasDiscount
      ? '<span class="price-normal">' + formatMoney(pricing.normalTotal) + '</span><span class="price-discount">' + formatMoney(pricing.discountedTotal) + '</span>'
      : formatMoney(pricing.discountedTotal);
    return '<div class="cart-item"><div class="thumb" style="background-image:url(\'' + escapeHtml(imageUrl) + '\')"></div><div class="info">'+
      '<div class="nm">'+escapeHtml(displayName)+'</div><div class="pr">'+linePriceMarkup+'</div>'+
      '<div class="qty"><button type="button" aria-label="Decrease quantity" data-dec="'+itemId+'">-</button><span>'+qty+'</span><button type="button" aria-label="Increase quantity" data-inc="'+itemId+'">+</button></div>'+
      '</div><button class="rm" type="button" data-rm="'+itemId+'">Remove</button></div>';
  }).join('');
  var checkoutItemsHtml = items.map(function(item){
    var itemId = Number(item.id);
    var qty = Number(item.quantity || 0);
    var pricing = getQuantityPricing(Number(item.price || 0), qty);
    var unitPrice = Number(item.price || 0);
    var imageUrl = item.image_url || DEFAULT_PRODUCT_IMAGE_URL;
    var stock = Number(item.stock_quantity || 0);
    var stockWarning = '';
    if(stock > 0 && qty >= stock){
      stockWarning = '<p class="checkout-stock-warning">Max available quantity in stock.</p>';
    } else if(stock > 0 && (stock - qty) <= 2){
      stockWarning = '<p class="checkout-stock-warning">Only ' + (stock - qty) + ' left after this quantity.</p>';
    }
    var isPending = isCartItemPending(itemId);
    var disabledAttr = isPending ? ' disabled aria-disabled="true"' : '';
    var pendingClass = isPending ? ' is-pending' : '';
    var displayName = escapeHtml(item.name || 'Product');
    var variantLine = item.variant_name ? ('<p class="checkout-summary-variant">' + escapeHtml(item.variant_name) + '</p>') : '';
    return '<article class="checkout-summary-item">'
      + '<div class="thumb" style="background-image:url(\'' + escapeHtml(imageUrl) + '\')"></div>'
      + '<div class="checkout-summary-content' + pendingClass + '">'
      + '<p class="checkout-summary-name">' + displayName + '</p>'
      + variantLine
      + '<p class="checkout-summary-each">Each: ' + formatMoney(unitPrice) + '</p>'
      + stockWarning
      + '<div class="checkout-summary-qty">'
      + '<button type="button" aria-label="Decrease quantity for ' + displayName + '" data-dec="' + itemId + '"' + disabledAttr + '>−</button>'
      + '<span aria-live="off">' + qty + '</span>'
      + '<button type="button" aria-label="Increase quantity for ' + displayName + '" data-inc="' + itemId + '"' + disabledAttr + '>+</button>'
      + '</div>'
      + '<button type="button" class="checkout-summary-remove" aria-label="Remove ' + displayName + ' from cart" data-rm="' + itemId + '"' + disabledAttr + '>Remove</button>'
      + '</div>'
      + '<strong class="checkout-summary-price">' + formatMoney(pricing.discountedTotal) + '</strong>'
      + '</article>';
  }).join('');
  if(body) body.innerHTML = drawerItemsHtml;
  if(checkout) checkout.innerHTML = checkoutItemsHtml;
  var miniCheckoutEnabled = document.getElementById('miniCartCheckoutBtn');
  if(miniCheckoutEnabled){ miniCheckoutEnabled.disabled = false; }
  var attachHandlers = function(container){
    if(!container) return;
    container.querySelectorAll('[data-inc]').forEach(function(b){
      b.addEventListener('click', function(){ changeQty(b.getAttribute('data-inc'), 1); });
    });
    container.querySelectorAll('[data-dec]').forEach(function(b){
      b.addEventListener('click', function(){ changeQty(b.getAttribute('data-dec'), -1); });
    });
    container.querySelectorAll('[data-rm]').forEach(function(b){
      b.addEventListener('click', function(){ removeItem(b.getAttribute('data-rm')); });
    });
  };
  attachHandlers(body);
  attachHandlers(checkout);
}

function openCart(){
  ensureCartDrawer();
  var drawer = document.getElementById('drawer');
  var overlay = document.getElementById('cartOverlay');
  if(!drawer) return;
  miniCartPreviouslyFocused = document.activeElement;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  if(overlay) overlay.classList.add('show');
  syncMiniCartBodyLock();
  document.addEventListener('keydown', handleMiniCartKeydown);
  var focusable = getMiniCartFocusable();
  if(focusable.length){
    focusable[0].focus();
  } else {
    drawer.focus();
  }
}
function closeCart(){
  var drawer = document.getElementById('drawer');
  var overlay = document.getElementById('cartOverlay');
  if(drawer){
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  if(overlay) overlay.classList.remove('show');
  syncMiniCartBodyLock();
  document.removeEventListener('keydown', handleMiniCartKeydown);
  var focusTarget = miniCartFocusReturnEl || miniCartPreviouslyFocused;
  if(focusTarget && typeof focusTarget.focus === 'function'){
    focusTarget.focus();
  }
}

// ---------- Toast ----------
var toastTimer;
function showToast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2000);
}

// ---------- Contact form ----------
function submitForm(e){
  e.preventDefault();
  document.querySelector('.form-msg').style.display='block';
  e.target.reset();
  return false;
}

// ---------- Account auth ----------
function authApi(path, options){
  var request = options || {};
  request.credentials = 'include';
  request.headers = request.headers || {};
  if(!(request.body instanceof FormData)){
    request.headers['Content-Type'] = request.headers['Content-Type'] || 'application/json';
  }

  return fetch(path, request).then(function(res){
    return res.json().catch(function(){ return {}; }).then(function(data){
      if(!res.ok){
        var error = new Error(data.error || 'Request failed');
        error.status = res.status;
        error.code = data.code;
        error.details = data.details;
        throw error;
      }
      return data;
    });
  });
}

function loadAuthSession(){
  return authApi('/api/auth/session', { method:'GET' }).then(function(data){
    currentAuthSession = data.user || null;
    return currentAuthSession;
  }).catch(function(){
    currentAuthSession = null;
    return null;
  });
}

function normalizeEmail(email){
  return (email || '').toString().trim().toLowerCase();
}

function normalizePromoCodeForCheckout(code){
  return String(code || '').trim().toUpperCase();
}

function ensureAuthModal(){
  var googleIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.25-.95 2.3-2.02 3.01l3.26 2.53c1.9-1.75 2.99-4.33 2.99-7.39 0-.71-.06-1.39-.2-2.05H12z"></path><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.26-2.53c-.9.61-2.05.98-3.37.98-2.59 0-4.78-1.75-5.56-4.11l-3.37 2.6C4.72 19.83 8.1 22 12 22z"></path><path fill="#4A90E2" d="M6.44 13.91A5.98 5.98 0 0 1 6.12 12c0-.66.12-1.31.32-1.91l-3.37-2.6A9.94 9.94 0 0 0 2 12c0 1.6.38 3.11 1.07 4.51l3.37-2.6z"></path><path fill="#FBBC05" d="M12 5.98c1.46 0 2.78.5 3.82 1.49l2.86-2.86C16.96 2.98 14.7 2 12 2 8.1 2 4.72 4.17 3.07 7.49l3.37 2.6c.78-2.36 2.97-4.11 5.56-4.11z"></path></svg>';
  if(document.getElementById('authModal')) return;
  var wrapper = document.createElement('div');
  wrapper.id = 'authModal';
  wrapper.className = 'auth-modal';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.innerHTML = ''+
    '<div class="auth-modal-backdrop" data-auth-close="1"></div>'+
    '<div class="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">'+
      '<button type="button" class="auth-close" id="authCloseBtn" aria-label="Close account panel">&times;</button>'+
      '<h3 id="authTitle">Your Account</h3>'+
      '<p class="auth-sub">Create an account or sign in to continue.</p>'+
      '<div class="auth-tabs">'+
        '<button type="button" class="auth-tab active" data-auth-tab="signup">Sign Up</button>'+
        '<button type="button" class="auth-tab" data-auth-tab="login">Log In</button>'+
      '</div>'+
      '<div class="auth-body">'+
        '<div class="auth-panel" id="authSignedPanel" style="display:none"></div>'+
        '<div class="auth-panel" id="authSignupPanel">'+
          '<button type="button" class="google-auth-btn" id="googleSignupBtn" aria-label="Continue with Google">'+
            '<span class="google-auth-icon">'+googleIcon+'</span>'+
            '<span>Continue with Google</span>'+
          '</button>'+
          '<div class="auth-divider"><span>or use your email</span></div>'+
          '<form id="signupForm" class="auth-form" autocomplete="on">'+
            '<label><span>Full Name</span><input type="text" name="name" required></label>'+
            '<label><span>Email</span><input type="email" name="email" required></label>'+
            '<label><span>Password</span><input type="password" name="password" minlength="8" required></label>'+
            '<label><span>Institution Type</span>'+
              '<select name="institution" required>'+
                '<option value="">Select institution type...</option>'+
                '<option value="University / Academic">University / Academic</option>'+
                '<option value="Research Laboratory">Research Laboratory</option>'+
                '<option value="Clinical / Medical Facility">Clinical / Medical Facility</option>'+
                '<option value="Biotech / Pharmaceutical Company">Biotech / Pharmaceutical Company</option>'+
                '<option value="Government Agency">Government Agency</option>'+
                '<option value="Independent Researcher">Independent Researcher</option>'+
                '<option value="Other">Other</option>'+
              '</select>'+
            '</label>'+
            '<button type="submit" class="btn primary">Create Account</button>'+
          '</form>'+
        '</div>'+
        '<div class="auth-panel" id="authLoginPanel" style="display:none">'+
          '<button type="button" class="google-auth-btn" id="googleLoginBtn" aria-label="Continue with Google">'+
            '<span class="google-auth-icon">'+googleIcon+'</span>'+
            '<span>Continue with Google</span>'+
          '</button>'+
          '<div class="auth-divider"><span>or log in with email</span></div>'+
          '<form id="loginForm" class="auth-form" autocomplete="on">'+
            '<label><span>Email</span><input type="email" name="email" required></label>'+
            '<label><span>Password</span><input type="password" name="password" required></label>'+
            '<button type="submit" class="btn primary">Log In</button>'+
          '</form>'+
        '</div>'+
        '<p class="auth-message" id="authMessage" aria-live="polite"></p>'+
      '</div>'+
    '</div>';
  document.body.appendChild(wrapper);
}

function setAuthMessage(message, isError){
  var el = document.getElementById('authMessage');
  if(!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', !!isError);
  el.classList.toggle('success', !!message && !isError);
}

function switchAuthTab(tab){
  var signupPanel = document.getElementById('authSignupPanel');
  var loginPanel = document.getElementById('authLoginPanel');
  var signedPanel = document.getElementById('authSignedPanel');
  if(!signupPanel || !loginPanel || !signedPanel) return;
  signedPanel.style.display = 'none';
  signupPanel.style.display = tab === 'signup' ? 'block' : 'none';
  loginPanel.style.display = tab === 'login' ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach(function(btn){
    btn.classList.toggle('active', btn.getAttribute('data-auth-tab') === tab);
  });
}

function renderSignedInPanel(session){
  var signedPanel = document.getElementById('authSignedPanel');
  if(!signedPanel) return;
  signedPanel.innerHTML = ''+
    '<div class="signed-box">'+
      '<p><strong>Signed in as:</strong> ' + session.name + '</p>'+
      '<p><strong>Email:</strong> ' + session.email + '</p>'+
      '<p><strong>Institution:</strong> ' + (session.institution || 'Not set') + '</p>'+
      '<p><strong>Method:</strong> ' + session.provider + '</p>'+
      '<button type="button" class="btn ghost" id="logoutBtn">Log Out</button>'+
    '</div>';
  signedPanel.style.display = 'block';
  var signupPanel = document.getElementById('authSignupPanel');
  var loginPanel = document.getElementById('authLoginPanel');
  if(signupPanel) signupPanel.style.display = 'none';
  if(loginPanel) loginPanel.style.display = 'none';
  document.querySelectorAll('.auth-tab').forEach(function(btn){ btn.classList.remove('active'); });
  var logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn){
    logoutBtn.addEventListener('click', function(){
      authApi('/api/auth/logout', { method:'POST' }).then(function(){
        currentAuthSession = null;
        setAuthMessage('Logged out successfully.', false);
        switchAuthTab('login');
        updateAccountButtonState();
        window.dispatchEvent(new CustomEvent('pepx-auth-changed', { detail: { session: null } }));
      }).catch(function(err){
        setAuthMessage(err.message || 'Logout failed.', true);
      });
    });
  }
}

function openAuthModal(defaultTab){
  ensureAuthModal();
  var modal = document.getElementById('authModal');
  if(!modal) return;

  loadAuthSession().then(function(session){
    if(session){
      renderSignedInPanel(session);
    } else {
      switchAuthTab(defaultTab || 'signup');
    }
    setAuthMessage('', false);
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
  });
}

function closeAuthModal(){
  var modal = document.getElementById('authModal');
  if(!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  if(!document.getElementById('gate') || document.getElementById('gate').classList.contains('hidden')){
    document.body.classList.remove('locked');
  }
}

function handleGoogleAuth(){
  var next = window.location.pathname + window.location.search;
  window.location.href = '/auth/google?next=' + encodeURIComponent(next);
}

function updateAccountButtonState(){
  var accountBtn = document.getElementById('accountBtn');
  if(!accountBtn) return;
  var session = currentAuthSession;
  if(session){
    accountBtn.setAttribute('title', 'Account: ' + session.name);
    accountBtn.setAttribute('aria-label', 'Account: signed in as ' + session.name);
    accountBtn.classList.add('signed-in');
  } else {
    accountBtn.setAttribute('title', 'Account');
    accountBtn.setAttribute('aria-label', 'Account');
    accountBtn.classList.remove('signed-in');
  }
}

function initAuth(){
  ensureAuthModal();
  var modal = document.getElementById('authModal');
  if(!modal) return;

  loadAuthSession().then(function(){
    updateAccountButtonState();

    var params = new URLSearchParams(window.location.search);
    var authState = params.get('auth');
    if(authState === 'google-success'){
      showToast('Google sign-in successful.');
    } else if(authState === 'google-cancelled'){
      showToast('Google sign-in was cancelled.');
    } else if(authState === 'google-failed'){
      showToast('Google sign-in failed. Please try again.');
    } else if(authState === 'google-email-unverified'){
      showToast('Google account email must be verified before sign-in.');
    } else if(authState === 'google-email-missing'){
      showToast('Google account did not provide a usable email.');
    } else if(authState === 'google-link-conflict'){
      showToast('That email is already linked to a different Google account.');
    } else if(authState === 'google-link-failed'){
      showToast('Google account linking failed. Please sign in with email first.');
    } else if(authState === 'google-session-failed'){
      showToast('Could not start a secure session. Please try again.');
    } else if(authState === 'google-not-configured'){
      showToast('Google sign-in is not configured yet.');
    } else if(authState === 'account-required'){
      showToast('Please sign in to access your account page.');
    }

    if(authState){
      params.delete('auth');
      var next = window.location.pathname + (params.toString() ? ('?' + params.toString()) : '') + window.location.hash;
      window.history.replaceState({}, '', next);
    }
  });

  modal.addEventListener('click', function(e){
    if(e.target.matches('[data-auth-close="1"]')) closeAuthModal();
  });
  var closeBtn = document.getElementById('authCloseBtn');
  if(closeBtn){ closeBtn.addEventListener('click', closeAuthModal); }

  document.querySelectorAll('.auth-tab').forEach(function(btn){
    btn.addEventListener('click', function(){
      switchAuthTab(btn.getAttribute('data-auth-tab'));
      setAuthMessage('', false);
    });
  });

  var signupForm = document.getElementById('signupForm');
  if(signupForm){
    signupForm.addEventListener('submit', function(e){
      e.preventDefault();
      var fd = new FormData(signupForm);
      var name = (fd.get('name') || '').toString().trim();
      var email = normalizeEmail(fd.get('email'));
      var password = (fd.get('password') || '').toString();
      var institution = (fd.get('institution') || '').toString();

      if(!name || !email || !password || !institution){
        setAuthMessage('All signup fields are required.', true);
        return;
      }
      if(password.length < 8){
        setAuthMessage('Password must be at least 8 characters.', true);
        return;
      }

      authApi('/api/auth/signup', {
        method:'POST',
        body: JSON.stringify({
          name: name,
          email: email,
          password: password,
          institution: institution
        })
      }).then(function(data){
        currentAuthSession = data.user;
        setAuthMessage('Account created successfully.', false);
        signupForm.reset();
        renderSignedInPanel(currentAuthSession);
        updateAccountButtonState();
        window.dispatchEvent(new CustomEvent('pepx-auth-changed', { detail: { session: currentAuthSession } }));
        showToast('Welcome, ' + currentAuthSession.name + '!');
      }).catch(function(err){
        setAuthMessage(err.message || 'Signup failed.', true);
      });
    });
  }

  var loginForm = document.getElementById('loginForm');
  if(loginForm){
    loginForm.addEventListener('submit', function(e){
      e.preventDefault();
      var fd = new FormData(loginForm);
      var email = normalizeEmail(fd.get('email'));
      var password = (fd.get('password') || '').toString();

      authApi('/api/auth/login', {
        method:'POST',
        body: JSON.stringify({ email: email, password: password })
      }).then(function(data){
        currentAuthSession = data.user;
        loginForm.reset();
        setAuthMessage('Login successful.', false);
        renderSignedInPanel(currentAuthSession);
        updateAccountButtonState();
        window.dispatchEvent(new CustomEvent('pepx-auth-changed', { detail: { session: currentAuthSession } }));
        showToast('Welcome back, ' + currentAuthSession.name + '!');
      }).catch(function(err){
        setAuthMessage(err.message || 'Login failed.', true);
      });
    });
  }

  var googleSignupBtn = document.getElementById('googleSignupBtn');
  if(googleSignupBtn){ googleSignupBtn.addEventListener('click', handleGoogleAuth); }
  var googleLoginBtn = document.getElementById('googleLoginBtn');
  if(googleLoginBtn){ googleLoginBtn.addEventListener('click', handleGoogleAuth); }

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeAuthModal();
  });
}

function formatOrderDate(value){
  var dt = new Date(value);
  if(Number.isNaN(dt.getTime())) return value || '';
  return dt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

var ACCOUNT_ADDRESS_BOOK_PREFIX = '__PEPX_ADDRESS_BOOK_V1__:';

function formatMoney(value){
  return '$' + Number(value || 0).toFixed(2);
}

function normalizeStatus(status){
  return String(status || '').trim().toLowerCase();
}

function getStatusTone(status){
  var key = normalizeStatus(status);
  if(key === 'cancelled' || key === 'failed') return 'danger';
  if(key === 'shipped' || key === 'delivered') return 'success';
  return 'info';
}

function formatStatusLabel(status){
  var key = normalizeStatus(status);
  if(!key) return 'Processing';
  return key.replace(/_/g, ' ').replace(/\b\w/g, function(ch){ return ch.toUpperCase(); });
}

function formatMemberSince(value){
  var dt = new Date(value);
  if(Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short'
  });
}

function buildOrderListCard(order){
  var status = String(order.status || 'processing');
  var statusTone = getStatusTone(status);
  var orderId = Number(order.id);
  var actionMarkup = Number.isInteger(orderId)
    ? '<button type="button" class="btn ghost btn-sm" data-order-view="' + orderId + '">View Order</button>'
    : '<button type="button" class="btn ghost btn-sm" disabled title="Order unavailable">View Order</button>';
  return '<article class="account-order-card">' +
    '<div class="account-order-head">' +
      '<h4>' + escapeHtml(order.order_number || ('Order #' + order.id)) + '</h4>' +
      '<span class="account-order-status ' + statusTone + '">' + escapeHtml(status) + '</span>' +
    '</div>' +
    '<div class="account-order-meta">' +
      '<span><strong>Date:</strong> ' + escapeHtml(formatOrderDate(order.created_at)) + '</span>' +
      '<span><strong>Total:</strong> ' + formatMoney(order.total) + '</span>' +
    '</div>' +
    '<div class="account-order-actions">' +
      actionMarkup +
    '</div>' +
  '</article>';
}

function getOrderTimelineMarkup(order){
  var key = normalizeStatus(order.status);
  var statusRank = {
    pending_payment: 0,
    paid: 1,
    processing: 2,
    shipped: 3,
    delivered: 4,
    completed: 4,
    cancelled: 5,
    failed: 5
  };
  var steps = [
    { key: 'pending_payment', label: 'Order placed', date: order.created_at },
    { key: 'paid', label: 'Payment received' },
    { key: 'processing', label: 'Processing' },
    { key: 'shipped', label: 'Shipped', date: order.shipped_at },
    { key: 'delivered', label: 'Delivered' }
  ];
  var currentRank = statusRank.hasOwnProperty(key) ? statusRank[key] : 2;

  return '<ol class="account-timeline">' + steps.map(function(step, idx){
    var stepRank = statusRank[step.key];
    var stepClass = '';
    if(key === 'cancelled' || key === 'failed') {
      stepClass = idx === 0 ? 'done' : '';
    } else if(stepRank < currentRank) {
      stepClass = 'done';
    } else if(stepRank === currentRank || (step.key === 'delivered' && currentRank >= 4)) {
      stepClass = 'current';
    }
    var dateText = step.date ? formatOrderDate(step.date) : '';
    return '<li class="' + stepClass + '"><span>' + escapeHtml(step.label) + '</span>' + (dateText ? ('<small>' + escapeHtml(dateText) + '</small>') : '') + '</li>';
  }).join('') + '</ol>';
}

function parseAddressBook(profile){
  var raw = String((profile && profile.shippingAddress) || '');
  if(raw.indexOf(ACCOUNT_ADDRESS_BOOK_PREFIX) === 0){
    try {
      var parsed = JSON.parse(raw.slice(ACCOUNT_ADDRESS_BOOK_PREFIX.length));
      return {
        addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [],
        defaultId: parsed.defaultId || null,
        phone: String(parsed.phone || '').trim()
      };
    } catch (err) {}
  }

  var addresses = [];
  var legacy = raw.trim();
  if(legacy){
    addresses.push({
      id: 'addr-1',
      fullName: String((profile && profile.name) || '').trim(),
      street: legacy,
      city: '',
      state: '',
      zip: '',
      country: 'United States'
    });
  }

  return {
    addresses: addresses,
    defaultId: addresses.length ? addresses[0].id : null,
    phone: ''
  };
}

function formatAddressSingleLine(address){
  if(!address) return '';
  return [address.street, address.city, address.state, address.zip, address.country]
    .filter(function(part){ return String(part || '').trim(); })
    .join(', ');
}

function serializeAddressBook(book){
  return ACCOUNT_ADDRESS_BOOK_PREFIX + JSON.stringify({
    addresses: Array.isArray(book.addresses) ? book.addresses : [],
    defaultId: book.defaultId || null,
    phone: String(book.phone || '').trim()
  });
}

function initAccountPage(){
  var page = document.querySelector('[data-account-page]');
  if(!page) return;

  var msg = document.getElementById('accountPageMessage');
  var profileForm = document.getElementById('accountProfileForm');
  var addressForm = document.getElementById('accountAddressForm');
  var passwordForm = document.getElementById('accountPasswordForm');
  var logoutBtn = document.getElementById('accountLogoutBtn');
  var navButtons = page.querySelectorAll('[data-account-tab]');
  var switchTabButtons = page.querySelectorAll('[data-switch-tab]');
  var panels = page.querySelectorAll('[data-account-panel]');
  var ordersList = document.getElementById('ordersList');
  var orderDetailCard = document.getElementById('orderDetailCard');
  var orderDetailBody = document.getElementById('orderDetailBody');
  var orderDetailTitle = document.getElementById('orderDetailTitle');
  var orderDetailBackBtn = document.getElementById('orderDetailBackBtn');
  var addressListRoot = document.getElementById('accountAddressList');
  var addressAddBtn = document.getElementById('accountAddressAddBtn');
  var addressEditor = document.getElementById('accountAddressEditor');
  var addressEditorTitle = document.getElementById('accountAddressEditorTitle');
  var addressCancelBtn = document.getElementById('accountAddressCancelBtn');
  var overviewRecentOrders = document.getElementById('overviewRecentOrders');
  var securityInfo = document.getElementById('securityInfo');
  var welcome = document.getElementById('accountWelcome');

  var state = {
    activeTab: 'overview',
    profile: null,
    orders: [],
    addressBook: { addresses: [], defaultId: null, phone: '' }
  };

  function setPageMessage(text, isError){
    if(!msg) return;
    msg.textContent = text || '';
    msg.classList.toggle('error', !!isError);
    msg.classList.toggle('success', !!text && !isError);
  }

  function setAccountLocked(locked){
    page.classList.toggle('account-locked', !!locked);
    if(locked){
      panels.forEach(function(panel){ panel.classList.remove('active'); });
      if(orderDetailCard) orderDetailCard.classList.add('hidden');
    } else {
      setActiveTab(state.activeTab);
    }
  }

  function setActiveTab(tab){
    state.activeTab = tab;
    navButtons.forEach(function(btn){
      btn.classList.toggle('active', btn.getAttribute('data-account-tab') === tab);
    });
    panels.forEach(function(panel){
      panel.classList.toggle('active', panel.getAttribute('data-account-panel') === tab);
    });
    if(tab !== 'orders' && orderDetailCard){
      orderDetailCard.classList.add('hidden');
    }
  }

  function renderOverviewCards(){
    var totalEl = document.getElementById('summaryTotalOrders');
    var recentEl = document.getElementById('summaryRecentOrder');
    var statusEl = document.getElementById('summaryAccountStatus');
    var memberEl = document.getElementById('summaryMemberSince');
    var orders = state.orders || [];
    var profile = state.profile || {};
    var recent = orders[0] || null;

    if(totalEl) totalEl.textContent = String(orders.length);
    if(recentEl) recentEl.textContent = recent ? String(recent.order_number || ('#' + recent.id)) : '-';
    if(statusEl) statusEl.textContent = currentAuthSession ? 'Active' : 'Guest';
    if(memberEl) memberEl.textContent = formatMemberSince(currentAuthSession && currentAuthSession.createdAt);

    if(welcome){
      var displayName = (profile.name || (currentAuthSession && currentAuthSession.name) || 'Researcher').trim();
      welcome.textContent = 'Welcome back, ' + displayName;
    }

    if(overviewRecentOrders){
      var preview = orders.slice(0, 3);
      overviewRecentOrders.innerHTML = preview.length
        ? preview.map(buildOrderListCard).join('')
        : '<p class="account-empty">No orders yet.</p>';
    }
  }

  function renderOrdersList(){
    if(!ordersList) return;
    var orders = state.orders || [];
    ordersList.innerHTML = orders.length
      ? orders.map(buildOrderListCard).join('')
      : '<p class="account-empty">No orders found.</p>';
  }

  function renderOrderDetail(detail){
    if(!orderDetailCard || !orderDetailBody || !detail || !detail.order) return;
    var order = detail.order;
    var items = Array.isArray(detail.items) ? detail.items : [];
    var shippingLine = [order.shipping_address, order.shipping_city, order.shipping_state, order.shipping_zip, order.shipping_country]
      .filter(function(part){ return String(part || '').trim(); })
      .join(', ');
    var tracking = detail.shipping && detail.shipping.tracking_number ? detail.shipping.tracking_number : order.tracking_number;
    var carrier = detail.shipping && detail.shipping.carrier ? detail.shipping.carrier : order.carrier;
    var shippingLabelUrl = detail.shipping && detail.shipping.shipping_label_url ? detail.shipping.shipping_label_url : order.shipping_label_url;
    var shippedAt = detail.shipping && detail.shipping.shipped_at ? detail.shipping.shipped_at : order.shipped_at;
    var shipmentStatus = shippedAt
      ? 'Shipped'
      : (tracking || shippingLabelUrl ? 'Label Created' : formatStatusLabel(order.status));
    var paymentStatus = detail.payment && detail.payment.status
      ? detail.payment.status
      : (normalizeStatus(order.status) === 'pending_payment' ? 'Pending' : 'Paid');
    var paymentMethod = detail.payment && detail.payment.method
      ? detail.payment.method
      : 'Not recorded';
    var subtotal = detail.totals && detail.totals.subtotal != null ? detail.totals.subtotal : 0;
    var subtotalBeforeDiscount = detail.totals && detail.totals.subtotal_before_discount != null
      ? detail.totals.subtotal_before_discount
      : subtotal;
    var discountAmount = detail.totals && detail.totals.discount_amount != null ? detail.totals.discount_amount : 0;
    var promoCode = detail.totals && detail.totals.promo_code ? detail.totals.promo_code : '';
    var shippingCost = detail.totals && detail.totals.shipping_cost != null ? detail.totals.shipping_cost : 0;
    var total = detail.totals && detail.totals.total != null ? detail.totals.total : order.total;
    var customerName = order.shipping_name || (state.profile && state.profile.name) || '-';
    var customerEmail = order.shipping_email || (state.profile && state.profile.email) || '-';
    var statusTone = getStatusTone(order.status);

    if(orderDetailTitle){
      orderDetailTitle.textContent = 'Order #' + String(order.order_number || ('#' + order.id));
    }

    var itemRows = items.length ? items.map(function(item){
      var dosage = item.variant_name ? ('<span class="account-item-dose">' + escapeHtml(item.variant_name) + '</span>') : '';
      var qty = Number(item.quantity || 0);
      var price = Number(item.price || 0);
      return '<tr>' +
        '<td>' + escapeHtml(item.name || '') + dosage + '</td>' +
        '<td>' + qty + '</td>' +
        '<td>' + formatMoney(price) + '</td>' +
        '<td>' + formatMoney(price * qty) + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="4">No line items found.</td></tr>';

    orderDetailBody.innerHTML = '' +
      '<section class="account-order-hero">' +
        '<div>' +
          '<p class="account-order-eyebrow">Order Details</p>' +
          '<h3 class="account-order-number">Order #' + escapeHtml(String(order.order_number || order.id || '')) + '</h3>' +
          '<p class="account-order-date">Placed on ' + escapeHtml(formatOrderDate(order.created_at)) + '</p>' +
        '</div>' +
        '<div class="account-order-hero-meta">' +
          '<span class="account-order-status ' + statusTone + '">' + escapeHtml(formatStatusLabel(order.status)) + '</span>' +
          '<div class="account-order-customer">' +
            '<p><strong>Customer:</strong> ' + escapeHtml(customerName) + '</p>' +
            '<p><strong>Email:</strong> ' + escapeHtml(customerEmail) + '</p>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<div class="account-order-detail-grid">' +
        '<div class="account-order-detail-block">' +
          '<h4>Order Summary</h4>' +
          '<div class="account-order-table-wrap">' +
            '<table class="account-order-table">' +
              '<thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Line Total</th></tr></thead>' +
              '<tbody>' + itemRows + '</tbody>' +
            '</table>' +
          '</div>' +
          '<div class="account-order-totals">' +
            '<p><span>Subtotal</span><strong>' + formatMoney(subtotalBeforeDiscount) + '</strong></p>' +
            (Number(discountAmount || 0) > 0
              ? ('<p><span>Discount' + (promoCode ? ' (' + escapeHtml(promoCode) + ')' : '') + '</span><strong>-' + formatMoney(discountAmount) + '</strong></p>')
              : '') +
            '<p><span>Shipping</span><strong>' + (Number(shippingCost) === 0 ? '<span class="account-shipping-free">FREE</span>' : formatMoney(shippingCost)) + '</strong></p>' +
            '<p class="grand"><span>Total</span><strong>' + formatMoney(total) + '</strong></p>' +
          '</div>' +
        '</div>' +
        '<aside class="account-order-side">' +
          '<div class="account-order-detail-block">' +
            '<h4>Shipping</h4>' +
            (order.shipping_service ? '<p><strong>Method:</strong> ' + escapeHtml(order.shipping_service) + '</p>' : '') +
            '<p><strong>Address:</strong> ' + escapeHtml(shippingLine || '-') + '</p>' +
            '<p><strong>Phone:</strong> ' + escapeHtml(order.shipping_phone || '-') + '</p>' +
            '<p><strong>Tracking:</strong> ' + escapeHtml(tracking || 'Not assigned yet') + '</p>' +
            '<p><strong>Carrier:</strong> ' + escapeHtml(carrier || 'Not assigned yet') + '</p>' +
            '<p><strong>Shipment Status:</strong> ' + escapeHtml(shipmentStatus) + '</p>' +
            (shippingLabelUrl ? '<p><a href="' + escapeHtml(shippingLabelUrl) + '" target="_blank" rel="noopener">View shipping label</a></p>' : '') +
          '</div>' +
          '<div class="account-order-detail-block">' +
            '<h4>Payment</h4>' +
            '<p><strong>Method:</strong> ' + escapeHtml(paymentMethod === 'zelle' ? 'Zelle' : paymentMethod) + '</p>' +
            '<p><strong>Status:</strong> ' + escapeHtml(paymentStatus) + '</p>' +
            (paymentMethod === 'zelle' && paymentStatus !== 'Paid'
              ? '<div class="account-zelle-instructions">' +
                  '<p class="account-zelle-title"><strong>Complete Your Zelle Payment</strong></p>' +
                  '<p><strong>Send To:</strong> pxresearch</p>' +
                  '<p><strong>Amount Due:</strong> ' + escapeHtml(formatMoney(total)) + '</p>' +
                  '<p><strong>Memo:</strong> ' + escapeHtml(String(order.order_number || '')) + '</p>' +
                  '<p class="account-zelle-warn">Your order will remain pending until we verify your Zelle payment. Please verify the recipient before sending.</p>' +
                '</div>'
              : '') +
          '</div>' +
        '</aside>' +
      '</div>' +
      '<div class="account-order-detail-block">' +
        '<h4>Order Status Timeline</h4>' +
        getOrderTimelineMarkup(order) +
      '</div>';

    orderDetailCard.classList.remove('hidden');
    if(order && Number.isInteger(Number(order.id))){
      updateOrderDetailUrl(Number(order.id));
    }
  }

  function updateOrderDetailUrl(orderId){
    var url = new URL(window.location.href);
    if(Number.isInteger(orderId)){
      url.searchParams.set('tab', 'orders');
      url.searchParams.set('order_id', String(orderId));
    } else {
      url.searchParams.delete('order_id');
    }
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  function openOrderDetail(orderId){
    if(!Number.isInteger(orderId)){
      return Promise.reject(new Error('Invalid order id'));
    }
    setActiveTab('orders');
    return authApi('/api/orders/' + orderId, { method: 'GET' })
      .then(function(detail){
        renderOrderDetail(detail);
        return detail;
      });
  }

  function getOrderIdFromLocation(){
    try {
      var params = new URLSearchParams(window.location.search || '');
      var id = parseInt(params.get('order_id'), 10);
      return Number.isInteger(id) ? id : null;
    } catch (e) {
      return null;
    }
  }

  function renderAddressList(){
    if(!addressListRoot) return;
    var addresses = state.addressBook.addresses || [];
    if(!addresses.length){
      addressListRoot.innerHTML = '<p class="account-empty">No saved addresses yet.</p>';
      return;
    }

    addressListRoot.innerHTML = addresses.map(function(addr){
      var isDefault = String(addr.id) === String(state.addressBook.defaultId);
      return '<article class="account-address-card" data-address-id="' + escapeHtml(String(addr.id)) + '">' +
        '<div class="account-address-head">' +
          '<h4>' + escapeHtml(addr.fullName || 'Shipping Address') + '</h4>' +
          (isDefault ? '<span class="account-default-badge">Default</span>' : '') +
        '</div>' +
        '<p>' + escapeHtml(formatAddressSingleLine(addr)) + '</p>' +
        '<div class="account-address-actions">' +
          '<button type="button" class="btn ghost btn-sm" data-address-edit="' + escapeHtml(String(addr.id)) + '">Edit</button>' +
          '<button type="button" class="btn ghost btn-sm" data-address-default="' + escapeHtml(String(addr.id)) + '">Set Default</button>' +
          '<button type="button" class="btn ghost btn-sm" data-address-delete="' + escapeHtml(String(addr.id)) + '">Delete</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function showAddressEditor(address){
    if(!addressEditor || !addressForm) return;
    addressEditor.classList.remove('hidden');
    if(addressEditorTitle){
      addressEditorTitle.textContent = address ? 'Edit Address' : 'Add Address';
    }
    addressForm.reset();
    addressForm.elements.addressId.value = address ? String(address.id) : '';
    addressForm.elements.fullName.value = address ? (address.fullName || '') : '';
    addressForm.elements.street.value = address ? (address.street || '') : '';
    addressForm.elements.city.value = address ? (address.city || '') : '';
    addressForm.elements.state.value = address ? (address.state || '') : '';
    addressForm.elements.zip.value = address ? (address.zip || '') : '';
    addressForm.elements.country.value = address ? (address.country || 'United States') : 'United States';
    addressForm.elements.isDefault.checked = address
      ? String(address.id) === String(state.addressBook.defaultId)
      : !(state.addressBook.addresses || []).length;
  }

  function hideAddressEditor(){
    if(!addressEditor || !addressForm) return;
    addressEditor.classList.add('hidden');
    addressForm.reset();
  }

  function persistAddressBook(){
    var defaultAddress = (state.addressBook.addresses || []).find(function(addr){
      return String(addr.id) === String(state.addressBook.defaultId);
    }) || null;
    var billingAddress = defaultAddress ? formatAddressSingleLine(defaultAddress) : '';

    return authApi('/api/account/addresses', {
      method: 'PUT',
      body: JSON.stringify({
        billingAddress: billingAddress,
        shippingAddress: serializeAddressBook(state.addressBook)
      })
    });
  }

  function loadDashboard(){
    return Promise.all([
      authApi('/api/account/overview', { method: 'GET' }),
      authApi('/api/orders', { method: 'GET' })
    ]).then(function(results){
      var overview = results[0] || {};
      var orderRows = Array.isArray(results[1]) ? results[1] : [];
      var profile = overview.profile || {};

      state.profile = profile;
      state.orders = orderRows;
      state.addressBook = parseAddressBook(profile);

      if(profileForm){
        profileForm.name.value = profile.name || '';
        profileForm.email.value = profile.email || '';
        profileForm.phone.value = state.addressBook.phone || '';
        profileForm.institution.value = profile.institution || '';
      }

      if(securityInfo){
        var providerText = profile.provider || (currentAuthSession && currentAuthSession.provider) || 'Email';
        securityInfo.innerHTML = '<p><strong>Login Method:</strong> ' + escapeHtml(providerText) + '</p>' +
          '<p><strong>Account Email:</strong> ' + escapeHtml(profile.email || '') + '</p>';
      }

      renderOverviewCards();
      renderOrdersList();
      renderAddressList();
      hideAddressEditor();
      var requestedOrderId = getOrderIdFromLocation();
      if(Number.isInteger(requestedOrderId)){
        setActiveTab('orders');
        return openOrderDetail(requestedOrderId).catch(function(err){
          setPageMessage(err.message || 'Failed to load order details.', true);
        }).then(function(){ return results; });
      }
      return results;
    });
  }

  window.addEventListener('pepx-auth-changed', function(e){
    var session = e && e.detail ? e.detail.session : null;
    if(!session){
      setAccountLocked(true);
      setPageMessage('Sign in to view your account, orders, and saved addresses.', false);
      openAuthModal('login');
      return;
    }

    setAccountLocked(false);
    setPageMessage('', false);
    loadDashboard().catch(function(err){
      setPageMessage(err.message || 'Failed to load account data.', true);
    });
  });

  loadAuthSession().then(function(session){
    updateAccountButtonState();
    if(!session){
      setAccountLocked(true);
      setPageMessage('Sign in to view your account, orders, and saved addresses.', false);
      openAuthModal('login');
      return;
    }

    setAccountLocked(false);
    setPageMessage('', false);
    loadDashboard().catch(function(err){
      setPageMessage(err.message || 'Failed to load account data.', true);
    });
  });

  navButtons.forEach(function(btn){
    btn.addEventListener('click', function(){
      var tab = btn.getAttribute('data-account-tab');
      if(tab) setActiveTab(tab);
    });
  });

  switchTabButtons.forEach(function(btn){
    btn.addEventListener('click', function(){
      var tab = btn.getAttribute('data-switch-tab');
      if(tab) setActiveTab(tab);
    });
  });

  if(ordersList){
    ordersList.addEventListener('click', function(e){
      var viewBtn = e.target.closest('[data-order-view]');
      if(!viewBtn) return;
      var orderId = parseInt(viewBtn.getAttribute('data-order-view'), 10);
      if(!Number.isInteger(orderId)) return;
      openOrderDetail(orderId)
        .catch(function(err){
          setPageMessage(err.message || 'Failed to load order details.', true);
        });
    });
  }

  if(overviewRecentOrders){
    overviewRecentOrders.addEventListener('click', function(e){
      var viewBtn = e.target.closest('[data-order-view]');
      if(!viewBtn) return;
      var orderId = parseInt(viewBtn.getAttribute('data-order-view'), 10);
      if(!Number.isInteger(orderId)) return;
      openOrderDetail(orderId)
        .catch(function(err){
          setPageMessage(err.message || 'Failed to load order details.', true);
        });
    });
  }

  if(orderDetailBackBtn){
    orderDetailBackBtn.addEventListener('click', function(){
      if(orderDetailCard) orderDetailCard.classList.add('hidden');
      updateOrderDetailUrl(null);
    });
  }

  if(addressAddBtn){
    addressAddBtn.addEventListener('click', function(){
      showAddressEditor(null);
    });
  }

  if(addressCancelBtn){
    addressCancelBtn.addEventListener('click', hideAddressEditor);
  }

  if(addressListRoot){
    addressListRoot.addEventListener('click', function(e){
      var editBtn = e.target.closest('[data-address-edit]');
      if(editBtn){
        var editId = editBtn.getAttribute('data-address-edit');
        var target = (state.addressBook.addresses || []).find(function(addr){ return String(addr.id) === String(editId); });
        showAddressEditor(target || null);
        return;
      }

      var defaultBtn = e.target.closest('[data-address-default]');
      if(defaultBtn){
        state.addressBook.defaultId = defaultBtn.getAttribute('data-address-default');
        persistAddressBook().then(function(){
          renderAddressList();
          setPageMessage('Default address updated.', false);
        }).catch(function(err){
          setPageMessage(err.message || 'Failed to update default address.', true);
        });
        return;
      }

      var deleteBtn = e.target.closest('[data-address-delete]');
      if(deleteBtn){
        var deleteId = deleteBtn.getAttribute('data-address-delete');
        state.addressBook.addresses = (state.addressBook.addresses || []).filter(function(addr){
          return String(addr.id) !== String(deleteId);
        });
        if(String(state.addressBook.defaultId) === String(deleteId)){
          state.addressBook.defaultId = state.addressBook.addresses.length
            ? state.addressBook.addresses[0].id
            : null;
        }
        persistAddressBook().then(function(){
          renderAddressList();
          hideAddressEditor();
          setPageMessage('Address deleted.', false);
        }).catch(function(err){
          setPageMessage(err.message || 'Failed to delete address.', true);
        });
      }
    });
  }

  if(profileForm){
    profileForm.addEventListener('submit', function(e){
      e.preventDefault();
      var fd = new FormData(profileForm);
      var nextPhone = String(fd.get('phone') || '').trim();
      authApi('/api/account/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: (fd.get('name') || '').toString().trim(),
          email: normalizeEmail(fd.get('email')),
          institution: (fd.get('institution') || '').toString().trim()
        })
      }).then(function(data){
        currentAuthSession = data.user || currentAuthSession;
        state.addressBook.phone = nextPhone;
        return persistAddressBook().catch(function(){ return null; });
      }).then(function(){
        updateAccountButtonState();
        renderOverviewCards();
        setPageMessage('Profile updated.', false);
      }).catch(function(err){
        setPageMessage(err.message || 'Failed to update profile.', true);
      });
    });
  }

  if(addressForm){
    addressForm.addEventListener('submit', function(e){
      e.preventDefault();
      var fd = new FormData(addressForm);
      var addressId = String(fd.get('addressId') || '').trim() || ('addr-' + Date.now());
      var payload = {
        id: addressId,
        fullName: String(fd.get('fullName') || '').trim(),
        street: String(fd.get('street') || '').trim(),
        city: String(fd.get('city') || '').trim(),
        state: String(fd.get('state') || '').trim(),
        zip: String(fd.get('zip') || '').trim(),
        country: String(fd.get('country') || '').trim()
      };

      state.addressBook.addresses = (state.addressBook.addresses || []).filter(function(addr){
        return String(addr.id) !== String(addressId);
      }).concat([payload]);

      if(fd.get('isDefault') || !state.addressBook.defaultId){
        state.addressBook.defaultId = addressId;
      }

      persistAddressBook().then(function(){
        renderAddressList();
        hideAddressEditor();
        setPageMessage('Address saved.', false);
      }).catch(function(err){
        setPageMessage(err.message || 'Failed to update addresses.', true);
      });
    });
  }

  if(passwordForm){
    passwordForm.addEventListener('submit', function(e){
      e.preventDefault();
      var fd = new FormData(passwordForm);
      var newPassword = (fd.get('newPassword') || '').toString();
      var confirmNewPassword = (fd.get('confirmNewPassword') || '').toString();
      if(newPassword !== confirmNewPassword){
        setPageMessage('New password and confirmation do not match.', true);
        return;
      }

      authApi('/api/account/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: (fd.get('currentPassword') || '').toString(),
          newPassword: newPassword
        })
      }).then(function(){
        passwordForm.reset();
        setPageMessage('Password updated successfully.', false);
      }).catch(function(err){
        setPageMessage(err.message || 'Failed to update password.', true);
      });
    });
  }

  if(logoutBtn){
    logoutBtn.addEventListener('click', function(){
      authApi('/api/auth/logout', { method: 'POST' }).then(function(){
        window.location.href = '/index.html';
      });
    });
  }
}

// ---------- Reviews ----------
var reviews = [];
var HERO_REVIEW_FALLBACK = [
  {rating:5, name:'Avery M.', email:'Research Lab', message:'Excellent consistency between lots. Purity and handling quality are exactly what our bench workflow requires.'},
  {rating:5, name:'Logan R.', email:'Biotech Team', message:'Shipping and packaging have been reliable every time. Materials arrive cold, sealed, and ready for controlled use.'},
  {rating:5, name:'Taylor C.', email:'University Group', message:'Documentation and quality control are strong. This has become our preferred source for repeat peptide studies.'},
  {rating:4, name:'Jordan P.', email:'Independent Researcher', message:'Great communication and clear labeling. Products have integrated smoothly into our protocol validation work.'},
  {rating:5, name:'Riley D.', email:'Clinical Research Unit', message:'Fast fulfillment and consistent product integrity. We appreciate the professional handling standards.'},
  {rating:5, name:'Morgan L.', email:'Pharma R&D', message:'Reliable outcomes in our assays and very clean presentation. Exactly what we need from a research supplier.'}
];

function formatReviewDisplayName(name){
  var cleanName = (name || '').toString().trim();
  if(!cleanName) return 'Verified Researcher';
  var parts = cleanName.split(/\s+/);
  return parts.length > 1 ? parts[0] + ' ' + parts[parts.length-1].charAt(0) + '.' : cleanName;
}

function getHeroCollageReviews(){
  var source = reviews.length ? reviews.slice(0, 8) : HERO_REVIEW_FALLBACK.slice(0, 8);
  return source.map(function(review){
    return {
      rating: Math.max(1, Math.min(5, parseInt(review.rating, 10) || 5)),
      name: formatReviewDisplayName(review.name),
      message: (review.message || '').toString().trim() || 'High-quality materials and reliable service for repeatable research work.'
    };
  });
}

function renderHeroReviewCollage(){
  var root = document.getElementById('heroReviewCollage');
  if(!root) return;
  var entries = getHeroCollageReviews();
  var buildCards = function(items){
    return items.map(function(review){
      var stars = '★'.repeat(review.rating) + '☆'.repeat(5-review.rating);
      return '<article class="hero-review-card"><div class="hero-review-stars">'+stars+'</div><p class="hero-review-text">"'+escapeHtml(review.message)+'"</p><div class="hero-review-author">'+escapeHtml(review.name)+'</div></article>';
    }).join('');
  };
  var cards = buildCards(entries.concat(entries));
  root.innerHTML = '<div class="review-collage-track">'+cards+'</div>';
}

function renderReviews(){
  renderHeroReviewCollage();
  var list = document.getElementById('reviewList');
  if(!list) return;
  if(!reviews.length){
    list.innerHTML = '<div class="review-empty">No reviews yet. Be the first to leave one.</div>';
    return;
  }
  list.innerHTML = reviews.map(function(review){
    var stars = '★'.repeat(review.rating) + '☆'.repeat(5-review.rating);
    var displayName = formatReviewDisplayName(review.name);
    return '<div class="tcard"><div class="stars">'+stars+'</div><p>"'+review.message+'"</p><div class="who">'+displayName+'<span>'+review.email+'</span></div></div>';
  }).join('');
}

function addReview(form){
  var data = new FormData(form);
  var review = {
    rating: parseInt(data.get('rating'), 10),
    name: data.get('name').toString().trim(),
    email: data.get('email').toString().trim(),
    message: data.get('message').toString().trim()
  };
  if(!review.rating || !review.name || !review.email || !review.message){ return false; }
  reviews.unshift(review);
  renderReviews();
  form.reset();
  var picker = form.querySelector('.star-picker');
  if(picker){
    picker.querySelectorAll('.star-btn').forEach(function(btn){ btn.classList.remove('active'); });
    picker.querySelector('input[name="rating"]').value = '';
  }
  return true;
}

// ---------- Entry gate ----------
function initGate(){
  var overlay = document.getElementById('gate');
  if(!overlay) return;

  var hasAcceptedGate = false;
  try {
    hasAcceptedGate = window.localStorage.getItem(GATE_ACCEPTED_KEY) === 'true';
  } catch (err) {
    hasAcceptedGate = false;
  }

  if(hasAcceptedGate){
    overlay.classList.add('hidden');
    document.body.classList.remove('locked');
    return;
  }

  document.body.classList.add('locked');
  var r = document.getElementById('g-research');
  var a = document.getElementById('g-age');
  var i = document.getElementById('g-inst');
  var e = document.getElementById('g-enter');
  var h = document.getElementById('g-hint');
  
  if(!r || !a || !i || !e) return;
  
  function v(){
    var hasResearch = r.checked;
    var hasAge = a.checked;
    var hasInstitution = !!String(i.value || '').trim();
    var canEnter = hasResearch && hasAge && hasInstitution;
    e.disabled = !canEnter;

    if(!h) return;
    if(canEnter){
      h.textContent = 'All set. You can enter the site.';
      return;
    }
    if(!hasResearch){
      h.textContent = 'Please confirm research-use-only compliance.';
      return;
    }
    if(!hasAge){
      h.textContent = 'Please confirm you are 21 years of age or older.';
      return;
    }
    h.textContent = 'Please select your institution type.';
  }

  // Mobile browsers can emit different events for checkboxes/select pickers.
  ['change', 'input', 'click'].forEach(function(evt){
    r.addEventListener(evt, v);
    a.addEventListener(evt, v);
    i.addEventListener(evt, v);
  });
  
  e.addEventListener('click', function(){
    try { window.localStorage.setItem(GATE_ACCEPTED_KEY, 'true'); } catch (err) {}
    overlay.classList.add('hidden');
    document.body.classList.remove('locked');
  });
  
  var d = document.getElementById('g-decline');
  if(d) d.addEventListener('click', function(){ window.location.href='https://www.google.com'; });
  v();
}

function splitFullName(name){
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if(!parts.length){ return { first: '', last: '' }; }
  if(parts.length === 1){ return { first: parts[0], last: '' }; }
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function setCheckoutMessage(message, isError){
  var msg = document.getElementById('checkoutError');
  if(!msg) return;
  msg.textContent = message || '';
  msg.classList.toggle('error', !!isError);
}

function prefillCheckoutFromProfile(profile){
  if(!profile) return;
  var firstNameEl = document.getElementById('shipping_first_name');
  var lastNameEl = document.getElementById('shipping_last_name');
  var emailEl = document.getElementById('shipping_email');
  var addressEl = document.getElementById('shipping_address');
  var cityEl = document.getElementById('shipping_city');
  var stateEl = document.getElementById('shipping_state');
  var zipEl = document.getElementById('shipping_zip');
  var countryEl = document.getElementById('shipping_country');
  var phoneEl = document.getElementById('shipping_phone');

  var split = splitFullName(profile.name);
  if(firstNameEl && !firstNameEl.value.trim()) firstNameEl.value = split.first;
  if(lastNameEl && !lastNameEl.value.trim()) lastNameEl.value = split.last;
  if(emailEl && !emailEl.value.trim()) emailEl.value = profile.email || '';

  var addressBook = parseAddressBook(profile);
  var defaultAddress = (addressBook.addresses || []).find(function(addr){
    return String(addr.id) === String(addressBook.defaultId);
  }) || (addressBook.addresses || [])[0] || null;

  if(defaultAddress){
    if(addressEl && !addressEl.value.trim()) addressEl.value = defaultAddress.street || '';
    if(cityEl && !cityEl.value.trim()) cityEl.value = defaultAddress.city || '';
    if(stateEl && !stateEl.value.trim()) stateEl.value = defaultAddress.state || '';
    if(zipEl && !zipEl.value.trim()) zipEl.value = defaultAddress.zip || '';
    if(countryEl && !countryEl.value.trim()) countryEl.value = defaultAddress.country || 'United States';

    var checkoutName = splitFullName(defaultAddress.fullName);
    if(firstNameEl && !firstNameEl.value.trim() && checkoutName.first){ firstNameEl.value = checkoutName.first; }
    if(lastNameEl && !lastNameEl.value.trim() && checkoutName.last){ lastNameEl.value = checkoutName.last; }
  }

  if(phoneEl && !phoneEl.value.trim()) phoneEl.value = addressBook.phone || '';
}

function initCheckoutPage(){
  var checkoutPage = document.querySelector('.page-checkout');
  if(!checkoutPage) return;

  var promoInput = document.getElementById('promoCodeInput');
  var promoBtn = document.getElementById('applyPromoBtn');
  var removePromoBtn = document.getElementById('removePromoBtn');
  var promoMsg = document.getElementById('promoCodeMessage');
  var checkoutBtnEl = document.getElementById('checkoutBtn');
  var shippingForm = document.getElementById('shippingForm');

  checkoutState.shippingCost = 0;
  checkoutState.appliedPromoCode = null;
  checkoutState.appliedPromo = null;
  checkoutState.promoValidating = false;
  renderCart();

  // Toggle Zelle instructions panel when the Zelle payment option is selected.
  (function initZelleToggle(){
    var paymentRadios = document.querySelectorAll('input[name="payment_method"]');
    var zellePanel = document.getElementById('zelleInstructions');
    if(!zellePanel || !paymentRadios.length) return;

    function updateZellePanel(){
      var selected = document.querySelector('input[name="payment_method"]:checked');
      var isZelle = selected && selected.value === 'zelle';
      zellePanel.style.display = isZelle ? '' : 'none';
    }

    Array.prototype.forEach.call(paymentRadios, function(radio){
      radio.addEventListener('change', updateZellePanel);
    });

    zellePanel.addEventListener('click', function(e){
      var btn = e.target.closest('[data-copy]');
      if(!btn) return;
      var text = btn.getAttribute('data-copy');
      if(!text) return;
      if(navigator.clipboard){ navigator.clipboard.writeText(text).catch(function(){}); }
      else { try { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); } catch(err){} }
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function(){ btn.textContent = orig; }, 1500);
    });

    updateZellePanel();
  }());

  // ---- Shipping rate loading -----------------------------------------------
  var shippingRateDebounceTimer = null;

  function getAddressSnapshot(){
    return [
      String((document.getElementById('shipping_zip') || {}).value || '').trim(),
      String((document.getElementById('shipping_state') || {}).value || '').trim(),
      String((document.getElementById('shipping_city') || {}).value || '').trim(),
      String((document.getElementById('shipping_address') || {}).value || '').trim(),
      String((document.getElementById('shipping_country') || {}).value || '').trim()
    ].join('|');
  }

  function isAddressReadyForRating(){
    var zip = String((document.getElementById('shipping_zip') || {}).value || '').trim();
    var state = String((document.getElementById('shipping_state') || {}).value || '').trim();
    return zip.length >= 5 && state.length >= 2;
  }

  function setShippingRatesUI(mode, message){
    var loadingEl = document.getElementById('shippingRatesLoading');
    var errorEl = document.getElementById('shippingRatesError');
    var promptEl = document.getElementById('shippingRatesPrompt');
    var listEl = document.getElementById('shippingRatesList');
    var errMsg = document.getElementById('shippingRatesErrorMsg');
    var suggestionEl = document.getElementById('shippingAddressSuggestion');
    if(loadingEl) loadingEl.style.display = mode === 'loading' ? '' : 'none';
    if(errorEl) errorEl.style.display = mode === 'error' ? '' : 'none';
    if(promptEl) promptEl.style.display = mode === 'prompt' ? '' : 'none';
    if(listEl) listEl.style.display = mode === 'list' ? '' : 'none';
    if(suggestionEl) suggestionEl.style.display = mode === 'suggestion' ? '' : 'none';
    if(errMsg && message) errMsg.textContent = message;
  }

  function formatSuggestionAddress(a){
    if(!a) return '';
    var parts = [];
    if(a.street1) parts.push(escapeHtml(a.street1));
    if(a.street2) parts.push(escapeHtml(a.street2));
    var cityLine = [a.city, a.state].filter(Boolean).join(', ');
    if(a.zip) cityLine = (cityLine ? cityLine + ' ' : '') + a.zip;
    if(cityLine) parts.push(escapeHtml(cityLine));
    if(a.country) parts.push(escapeHtml(a.country));
    return parts.join('<br>');
  }

  function renderAddressSuggestion(details){
    var origEl = document.getElementById('suggestionOriginalAddress');
    var sugEl = document.getElementById('suggestionSuggestedAddress');
    if(origEl) origEl.innerHTML = formatSuggestionAddress(details && details.originalAddress);
    if(sugEl) sugEl.innerHTML = formatSuggestionAddress(details && details.suggestedAddress);
    var useBtn = document.getElementById('useSuggestedAddress');
    var keepBtn = document.getElementById('keepOriginalAddress');
    if(useBtn && !useBtn.dataset.bound){
      useBtn.dataset.bound = '1';
      useBtn.addEventListener('click', function(){
        var d = checkoutState.addressSuggestion;
        if(d && d.suggestedAddress){ applySuggestedAddress(d.suggestedAddress); }
        loadShippingRates(true);
      });
    }
    if(keepBtn && !keepBtn.dataset.bound){
      keepBtn.dataset.bound = '1';
      keepBtn.addEventListener('click', function(){
        loadShippingRates(true);
      });
    }
  }

  function applySuggestedAddress(a){
    if(!a) return;
    function setVal(id, val){ var el = document.getElementById(id); if(el && val != null && val !== ''){ el.value = val; } }
    setVal('shipping_address', a.street1);
    setVal('shipping_city', a.city);
    setVal('shipping_state', a.state);
    setVal('shipping_zip', a.zip);
    checkoutState.lastRatedAddress = null;
  }

  function renderShippingRates(rates, shipmentId, effectiveSubtotal){
    var listEl = document.getElementById('shippingRatesList');
    if(!listEl) return;
    if(!rates || !rates.length){
      setShippingRatesUI('error', 'No USPS shipping rates are available for your address. Please verify the ZIP code.');
      return;
    }
    listEl.innerHTML = rates.map(function(rate){
      var isGroundAdv = rate.canonicalService === 'USPS Ground Advantage';
      var qualifiesFree = isGroundAdv && effectiveSubtotal >= FREE_SHIPPING_THRESHOLD;
      var priceDisplay = qualifiesFree
        ? '<span class="shipping-rate-free">FREE</span><span class="shipping-rate-price-orig"> (normally ' + formatMoney(rate.price) + ')</span>'
        : '<span class="shipping-rate-price">' + formatMoney(rate.price) + '</span>';
      var freeNote = qualifiesFree ? '<span class="shipping-rate-free-note">FREE Ground Advantage on orders $' + FREE_SHIPPING_THRESHOLD.toFixed(2) + '+</span>' : '';
      var upgradeNote = !isGroundAdv && effectiveSubtotal >= FREE_SHIPPING_THRESHOLD
        ? '<span class="shipping-rate-upgrade-note">Paid upgrade — Ground Advantage is FREE with your order</span>'
        : '';
      var eta = rate.deliveryDays != null
        ? '<span class="shipping-rate-eta">Est. ' + rate.deliveryDays + ' business day' + (rate.deliveryDays === 1 ? '' : 's') + '</span>'
        : '';
      var selected = checkoutState.selectedRate && checkoutState.selectedRate.rateId === rate.rateId;
      return '<label class="shipping-rate-card' + (selected ? ' selected' : '') + '">'
        + '<input type="radio" name="shipping_rate" value="' + escapeHtml(rate.rateId) + '"' + (selected ? ' checked' : '') + ' aria-label="' + escapeHtml(rate.canonicalService) + '">'
        + '<div class="shipping-rate-details">'
        + '<span class="shipping-rate-name">' + escapeHtml(rate.canonicalService) + '</span>'
        + priceDisplay
        + freeNote
        + upgradeNote
        + eta
        + '</div>'
        + '</label>';
    }).join('');

    listEl.querySelectorAll('input[name="shipping_rate"]').forEach(function(radio){
      radio.addEventListener('change', function(){
        if(!radio.checked) return;
        var rate = rates.find(function(r){ return r.rateId === radio.value; });
        if(!rate) return;
        checkoutState.selectedRate = rate;
        checkoutState.easypostShipmentId = shipmentId;
        // Re-render to reflect selection and recompute total
        renderShippingRates(checkoutState.shippingRates, checkoutState.easypostShipmentId, computeEffectiveSubtotal());
        renderCart();
      });
    });

    setShippingRatesUI('list');
  }

  function computeEffectiveSubtotal(){
    var items = (cartData && Array.isArray(cartData.items)) ? cartData.items : [];
    var total = 0;
    items.forEach(function(item){
      total += getQuantityPricing(Number(item.price || 0), item.quantity).discountedTotal;
    });
    var promoDiscount = 0;
    if(checkoutState.appliedPromo && Number(checkoutState.appliedPromo.discount || 0) > 0){
      promoDiscount = Number(checkoutState.appliedPromo.discount || 0);
    }
    return Math.max(0, total - promoDiscount);
  }

  function loadShippingRates(confirmVerifiedAddress){
    if(!isAddressReadyForRating()) return;
    var snapshot = getAddressSnapshot();
    if(!confirmVerifiedAddress && snapshot === checkoutState.lastRatedAddress && checkoutState.shippingRates.length && !checkoutState.shippingRatesError) return;

    checkoutState.shippingRatesLoading = true;
    checkoutState.shippingRatesError = null;
    setShippingRatesUI('loading');

    var zip = String((document.getElementById('shipping_zip') || {}).value || '').trim();
    var state = String((document.getElementById('shipping_state') || {}).value || '').trim();
    var city = String((document.getElementById('shipping_city') || {}).value || '').trim();
    var address = String((document.getElementById('shipping_address') || {}).value || '').trim();
    var country = String((document.getElementById('shipping_country') || {}).value || '').trim() || 'US';
    var name = String((document.getElementById('shipping_first_name') || {}).value || '').trim() + ' ' + String((document.getElementById('shipping_last_name') || {}).value || '').trim();
    var phone = String((document.getElementById('shipping_phone') || {}).value || '').trim();

    authApi('/api/checkout/shipping/rates', {
      method: 'POST',
      body: JSON.stringify({ zip: zip, state: state, city: city, address: address, country: country, name: name.trim(), phone: phone, confirmVerifiedAddress: !!confirmVerifiedAddress })
    }).then(function(data){
      checkoutState.shippingRatesLoading = false;
      checkoutState.lastRatedAddress = snapshot;
        checkoutState.addressSuggestion = null;
      checkoutState.shippingRates = data.rates || [];
      checkoutState.easypostShipmentId = data.shipmentId || null;

      // Auto-select Ground Advantage (first/cheapest) by default.
      if(checkoutState.shippingRates.length && !checkoutState.selectedRate){
        checkoutState.selectedRate = checkoutState.shippingRates[0];
      }

      renderShippingRates(checkoutState.shippingRates, checkoutState.easypostShipmentId, computeEffectiveSubtotal());
      renderCart();
          }).catch(function(err){
        checkoutState.shippingRatesLoading = false;
        checkoutState.shippingRates = [];
        checkoutState.selectedRate = null;
        if(err && err.code === 'address-verification-confirmation-required' && err.details){
          checkoutState.addressSuggestion = err.details;
          checkoutState.shippingRatesError = null;
          renderAddressSuggestion(err.details);
          setShippingRatesUI('suggestion');
          renderCart();
          return;
        }
        checkoutState.addressSuggestion = null;
        if(err && err.code === 'address-verification-failed'){
          checkoutState.shippingRatesError = "We couldn't verify this address. Please review the address and try again.";
        } else {
          checkoutState.shippingRatesError = (err && err.message) || 'Unable to calculate shipping rates. Please check your address and try again.';
        }
        setShippingRatesUI('error', checkoutState.shippingRatesError);
        renderCart();
      });
  }

  function scheduleRateLoad(){
    clearTimeout(shippingRateDebounceTimer);
    shippingRateDebounceTimer = setTimeout(function(){
      var snap = getAddressSnapshot();
      if(snap !== checkoutState.lastRatedAddress || checkoutState.shippingRatesError){
        // Invalidate old selection when address changes.
        if(snap !== checkoutState.lastRatedAddress){
          checkoutState.selectedRate = null;
          checkoutState.shippingRates = [];
          checkoutState.easypostShipmentId = null;
          renderCart();
        }
        if(isAddressReadyForRating()) loadShippingRates();
        else setShippingRatesUI('prompt');
      }
    }, 600);
  }

  var retryBtn = document.getElementById('retryShippingRates');
  if(retryBtn){ retryBtn.addEventListener('click', function(){ checkoutState.lastRatedAddress = null; loadShippingRates(); }); }

  ['shipping_zip','shipping_state','shipping_city','shipping_address','shipping_country'].forEach(function(id){
    var el = document.getElementById(id);
    if(el){ el.addEventListener('input', scheduleRateLoad); el.addEventListener('change', scheduleRateLoad); }
  });

  // Load rates if address fields are already filled (e.g., prefilled from profile).
  if(isAddressReadyForRating()){ loadShippingRates(); } else { setShippingRatesUI('prompt'); }
  // ---- End shipping rate loading -------------------------------------------

  if(promoBtn && promoInput){
    promoInput.addEventListener('input', function(){
      if (!checkoutState.appliedPromoCode) return;
      if (normalizePromoCodeForCheckout(promoInput.value) !== checkoutState.appliedPromoCode) {
        checkoutState.appliedPromoCode = null;
        checkoutState.appliedPromo = null;
        if(promoMsg){ promoMsg.textContent = 'Code changed. Please apply again.'; }
        announceCartLive('Promo code changed. Please apply again.');
        renderCart();
      }
    });

    promoBtn.addEventListener('click', function(){
      var code = String(promoInput.value || '').trim();
      if (!code) {
        checkoutState.appliedPromoCode = null;
        checkoutState.appliedPromo = null;
        if (promoMsg) { promoMsg.textContent = 'Please enter a discount code.'; }
        announceCartLive('Please enter a discount code.');
        renderCart();
        return;
      }
      if(!(cartData && Array.isArray(cartData.items) && cartData.items.length)){
        if (promoMsg) { promoMsg.textContent = 'Your cart is empty.'; }
        announceCartLive('Your cart is empty.');
        return;
      }

      checkoutState.promoValidating = true;
      promoBtn.disabled = true;
      if (promoMsg) { promoMsg.textContent = 'Applying code...'; }

      authApi('/api/orders/validate-promo', {
        method: 'POST',
        body: JSON.stringify({ code: code })
      }).then(function(result){
        checkoutState.appliedPromoCode = String(result.code || '').toUpperCase();
        checkoutState.appliedPromo = result;
        promoInput.value = checkoutState.appliedPromoCode;
        if (promoMsg) {
          promoMsg.textContent = 'Discount code applied: ' + checkoutState.appliedPromoCode;
        }
        announceCartLive('Discount code applied: ' + checkoutState.appliedPromoCode + '.');
        renderCart();
        // Re-render rates to reflect updated free-shipping eligibility.
        if(checkoutState.shippingRates.length){
          renderShippingRates(checkoutState.shippingRates, checkoutState.easypostShipmentId, computeEffectiveSubtotal());
        }
      }).catch(function(err){
        checkoutState.appliedPromoCode = null;
        checkoutState.appliedPromo = null;
        if (err && err.status === 401) {
          if (promoMsg) { promoMsg.textContent = 'Please sign in to apply a discount code.'; }
          announceCartLive('Please sign in to apply a discount code.');
          openAuthModal('login');
          return;
        }
        if (promoMsg) { promoMsg.textContent = (err && err.message) || 'Could not apply discount code.'; }
        announceCartLive((err && err.message) || 'Could not apply discount code.');
        renderCart();
      }).finally(function(){
        checkoutState.promoValidating = false;
        promoBtn.disabled = false;
        updateCheckoutActionState((cartData.items || []).length > 0);
      });
    });
  }

  if(removePromoBtn){
    removePromoBtn.addEventListener('click', function(){
      if(!checkoutState.appliedPromoCode) return;
      checkoutState.appliedPromoCode = null;
      checkoutState.appliedPromo = null;
      if(promoInput){ promoInput.value = ''; }
      if(promoMsg){ promoMsg.textContent = 'Discount code removed.'; }
      announceCartLive('Discount code removed.');
      renderCart();
    });
  }

  loadAuthSession().then(function(session){
    if(!session) return null;
    return authApi('/api/account/overview', { method: 'GET' })
      .then(function(data){
        prefillCheckoutFromProfile(data && data.profile ? data.profile : null);
      }).catch(function(){ return null; });
  });

  if(!checkoutBtnEl) return;
  checkoutBtnEl.addEventListener('click', function(){
    if(!(cartData && Array.isArray(cartData.items) && cartData.items.length)){
      showToast('Your cart is empty');
      announceCartLive('Your cart is empty.');
      return;
    }
    if(!currentAuthSession){
      showToast('Please sign in to place your order.');
      announceCartLive('Please sign in to place your order.');
      openAuthModal('login');
      return;
    }
    if(shippingForm && typeof shippingForm.reportValidity === 'function' && !shippingForm.reportValidity()){
      setCheckoutMessage('Please complete all required checkout fields.', true);
      return;
    }

    if(!checkoutState.selectedRate || !checkoutState.easypostShipmentId){
      setCheckoutMessage('Please select a shipping method before placing your order.', true);
      var methodCard = document.getElementById('shippingMethodCard');
      if(methodCard){ methodCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }

    var firstName = String((document.getElementById('shipping_first_name') || {}).value || '').trim();
    var lastName = String((document.getElementById('shipping_last_name') || {}).value || '').trim();
    var paymentMethodEl = document.querySelector('input[name="payment_method"]:checked');
    var shipping = {
      shipping_name: (firstName + ' ' + lastName).trim(),
      shipping_email: String((document.getElementById('shipping_email') || {}).value || '').trim(),
      shipping_address: String((document.getElementById('shipping_address') || {}).value || '').trim(),
      shipping_city: String((document.getElementById('shipping_city') || {}).value || '').trim(),
      shipping_state: String((document.getElementById('shipping_state') || {}).value || '').trim(),
      shipping_zip: String((document.getElementById('shipping_zip') || {}).value || '').trim(),
      shipping_country: String((document.getElementById('shipping_country') || {}).value || '').trim(),
      shipping_phone: String((document.getElementById('shipping_phone') || {}).value || '').trim(),
      payment_method: paymentMethodEl ? paymentMethodEl.value : 'zelle',
      promo_code: checkoutState.appliedPromoCode || null,
      easypost_shipment_id: checkoutState.easypostShipmentId,
      easypost_rate_id: checkoutState.selectedRate.rateId
    };

    setCheckoutMessage('', false);
    checkoutBtnEl.disabled = true;
    checkoutBtnEl.textContent = 'Placing Order...';
    authApi('/api/orders', {
      method: 'POST',
      body: JSON.stringify(shipping)
    }).then(function(order){
      cart = {};
      cartData = { items: [], total: 0 };
      renderCart();
      closeCart();
      showToast('Order confirmed \u2014 ' + (order.order_number || ''));
      announceCartLive('Order confirmed. Redirecting to order confirmation.');
      var qs = 'order_id=' + encodeURIComponent(order.order_id)
        + '&order_number=' + encodeURIComponent(order.order_number || '')
        + (order.payment_method ? '&payment_method=' + encodeURIComponent(order.payment_method) : '')
        + (order.shipping_service ? '&shipping_service=' + encodeURIComponent(order.shipping_service) : '');
      window.location.href = 'order-confirmation.html?' + qs;
    }).catch(function(err){
      if(err && err.status === 401){
        showToast('Please sign in to place your order.');
        announceCartLive('Please sign in to place your order.');
        openAuthModal('login');
        return;
      }
      setCheckoutMessage(err.message || 'Failed to place order. Please review your details and try again.', true);
      showToast(err.message || 'Failed to place order.');
      announceCartLive(err.message || 'Failed to place order.');
    }).finally(function(){
      checkoutBtnEl.textContent = checkoutBtnEl.getAttribute('data-default-label') || 'Place Order';
      updateCheckoutActionState((cartData.items || []).length > 0);
    });
  });
}

// ---------- Init ----------
// ---------- Load products from API (Supabase-backed) ----------
async function loadProductsFromAPI(options){
  var opts = options || {};
  var forceRefresh = !!opts.forceRefresh;

  if(productsLoadedFromAPI && !forceRefresh){
    return PRODUCTS;
  }

  if(productsLoadPromise){
    return productsLoadPromise;
  }

  var requestToken = ++productsLoadRequestToken;
  if(productsLoadAbortController){
    productsLoadAbortController.abort();
  }
  productsLoadAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

  productsLoadPromise = (async function(){
  try {
    var response = await fetch('/api/products', productsLoadAbortController ? { signal: productsLoadAbortController.signal } : undefined);
    if(response.ok !== true){ throw new Error('HTTP ' + response.status); }
    var data = await response.json();
    if(Array.isArray(data) === false){ return PRODUCTS; }
    if(requestToken !== productsLoadRequestToken){ return PRODUCTS; }
    PRODUCTS = data.map(function(row){
      var category = row.category || 'Uncategorized';
      return {
        id: row.id,
        name: row.name,
        category: category,
        description: row.description || '',
        price: Number(row.price),
        image: row.image_url,
        stock_quantity: Number(row.stock_quantity || 0),
        stock_status: row.stock_status || '',
        stock_message: row.stock_message || '',
        variants: Array.isArray(row.variants)
          ? row.variants.map(function(v){
              return {
                id: Number(v.id),
                name: v.name,
                price: Number(v.price),
                stock_quantity: Number(v.stock_quantity || 0)
              };
            })
          : [],
        tag: category ? String(category).toUpperCase() : '',
        color: '#eef1fc;color:#2f43e0',
        dosages: Array.isArray(row.variants)
          ? row.variants.map(function(v){ return v.name; })
          : []
      };
    });
    productsLoadedFromAPI = true;
    productsLastLoadedAt = Date.now();
    if(typeof renderProducts === 'function'){ renderProducts(getInitialProductSearchQuery()); }
    if(typeof renderHeroBestSellers === 'function'){ renderHeroBestSellers(); }
    if(typeof renderProductDetailPage === 'function'){ renderProductDetailPage(); }
    if(typeof renderCart === 'function'){ renderCart(); }
    return PRODUCTS;
  } catch(error){
    if(error && error.name === 'AbortError'){
      return PRODUCTS;
    }
    productsLoadedFromAPI = false;
    console.error('Failed to load products from API:', error);
    throw error;
  } finally {
    if(requestToken === productsLoadRequestToken){
      productsLoadPromise = null;
      productsLoadAbortController = null;
    }
  }
  })();

  return productsLoadPromise;
}

window.addEventListener('DOMContentLoaded', function(){
  if(appBootstrapInitialized) return;
  appBootstrapInitialized = true;

  var initialSearchQuery = getInitialProductSearchQuery();
  loadBackendCart();
  initShopCategoryFromUrl();
  initMenuDropdowns();
  initMobileNav();
  initThemeMode();
  initQuantitySteppers();
  initHeaderFogOnScroll();
  renderProducts(initialSearchQuery);
  renderHeroBestSellers();
  renderCart();
  renderProductDetailPage();
  initAccountPage();
  initGate();
  initAuth();
      loadProductsFromAPI();

  // FAQ accordion
  document.addEventListener('click', function(e){
    var q = e.target.closest('.q');
    if(q) q.parentElement.classList.toggle('open');
  });

  // Reviews form
  var reviewForm = document.getElementById('reviewForm');
  if(reviewForm){
    var picker = reviewForm.querySelector('.star-picker');
    if(picker){
      picker.querySelectorAll('.star-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var value = parseInt(btn.getAttribute('data-value'), 10);
          picker.querySelector('input[name="rating"]').value = value;
          picker.querySelectorAll('.star-btn').forEach(function(star){
            star.classList.toggle('active', parseInt(star.getAttribute('data-value'), 10) <= value);
          });
        });
      });
    }
    reviewForm.addEventListener('submit', function(e){
      e.preventDefault();
      var submitted = addReview(reviewForm);
      showToast(submitted ? 'Review submitted' : 'Please complete rating, name, email, and review');
    });
  }
  renderReviews();

  // Header + cart controls
  var searchWrap = document.getElementById('searchWrap');
  var headerSearchInput = document.getElementById('productSearch');
  var shopSearchInput = document.getElementById('shopProductSearch');
  var catalogSearchInput = shopSearchInput || headerSearchInput;
  if(catalogSearchInput && initialSearchQuery){
    catalogSearchInput.value = initialSearchQuery;
    if(headerSearchInput && headerSearchInput !== catalogSearchInput){
      headerSearchInput.value = initialSearchQuery;
    }
    if(searchWrap) searchWrap.classList.add('active');
  }
  initMiniCartControls();
  var closeProductModalBtn = document.getElementById('closeProductModal');
  if(closeProductModalBtn){ closeProductModalBtn.addEventListener('click', closeProductModal); }
  var backdrop = document.getElementById('backdrop');
  if(backdrop){ backdrop.addEventListener('click', function(){ closeProductModal(); }); }
  var addProductModalBtn = document.getElementById('addProductModalBtn');
  if(addProductModalBtn){ addProductModalBtn.addEventListener('click', addSelectedProductToCart); }
  var searchBtnEl = document.getElementById('searchBtn');
  if(searchBtnEl && searchWrap && headerSearchInput){
    searchBtnEl.addEventListener('click', function(){
      var query = headerSearchInput.value.trim();
      if(query){
        goToShopSearch(query);
        return;
      }
      searchWrap.classList.add('active');
      headerSearchInput.focus();
    });

    headerSearchInput.addEventListener('keydown', function(e){
      if(e.key !== 'Enter') return;
      e.preventDefault();
      var query = headerSearchInput.value.trim();
      if(query){
        goToShopSearch(query);
        return;
      }
      if(window.location.pathname.endsWith('shop.html') || window.location.pathname === '/shop.html'){
        renderProducts('');
      }
    });
  }
  if(catalogSearchInput){
    catalogSearchInput.addEventListener('input', function(){
      if(headerSearchInput && catalogSearchInput !== headerSearchInput){
        headerSearchInput.value = catalogSearchInput.value;
      }
      renderProducts(catalogSearchInput.value);
    });
  }

  document.querySelectorAll('.featured-category-strip .pill').forEach(function(btn){
    btn.addEventListener('click', function(){
      var category = normalizeCategoryFilter(btn.getAttribute('data-filter'));
      var target = 'shop.html?category=' + encodeURIComponent(category);
      window.location.href = target;
    });
  });

  document.querySelectorAll('.page-shop .pill-list .pill').forEach(function(btn){
    btn.addEventListener('click', function(){
      activeCategory = btn.getAttribute('data-filter');
      syncActiveCategoryPills();
      renderProducts(catalogSearchInput ? catalogSearchInput.value : '');
    });
  });

  var sortSelect = document.getElementById('sortSelect');
  if(sortSelect){
    sortSelect.addEventListener('change', function(){
      activeSort = sortSelect.value;
      renderProducts(catalogSearchInput ? catalogSearchInput.value : '');
    });
  }
  document.addEventListener('click', function(e){
    if(searchWrap && headerSearchInput && !searchWrap.contains(e.target) && headerSearchInput.value === ''){
      searchWrap.classList.remove('active');
    }
  });
  var accountBtn = document.getElementById('accountBtn');
  if(accountBtn){
    accountBtn.addEventListener('click', function(){
      openAuthModal('signup');
    });
  }
  initCheckoutPage();

  // Smooth scroll for in-page anchors
  document.querySelectorAll('a[href^="#"]').forEach(function(link){
    link.addEventListener('click', function(ev){
      var id = link.getAttribute('href');
      if(id.length>1){
        var el = document.querySelector(id);
        if(el){ ev.preventDefault(); el.scrollIntoView({behavior:'smooth'}); }
      }
    });
  });
});
