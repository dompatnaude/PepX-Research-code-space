<?php
/**
 * Plugin Name: PepX Research Storefront
 * Description: Adds the PepX Research catalog, product modal, search, cart, and review experience to WordPress.
 * Version: 1.0.0
 * Author: Copilot
 */

if (!defined('ABSPATH')) {
    exit;
}

class PepX_Research_Chemicals_Plugin {
    public function __construct() {
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
        add_shortcode('pepx_storefront', array($this, 'render_shortcode'));
    }

    public function enqueue_assets() {
        wp_enqueue_style('pepx-storefront-style', plugins_url('assets/style.css', __FILE__), array(), '1.0.0');
        wp_enqueue_script('pepx-storefront-script', plugins_url('assets/script.js', __FILE__), array(), '1.0.0', true);
    }

    public function render_shortcode($atts = array()) {
        ob_start();
        ?>
        <div class="pepx-storefront">
            <div class="overlay" id="gate">
                <div class="modal">
                    <div class="ml"><span class="logo-mark" aria-label="PepX Research"><span class="logo-word"><span class="logo-pep">pep</span><span class="logo-x">X</span></span><span class="logo-sub">research</span></span></div>
                    <h2>Before You Enter</h2>
                    <p class="intro">Please confirm the following to access this site.</p>
                    <label class="check"><input type="checkbox" id="g-research"><span>I understand that all products are sold strictly <b>for laboratory and research purposes only</b> and are not for human or animal consumption.</span></label>
                    <label class="check"><input type="checkbox" id="g-age"><span>I confirm that I am <b>21 years of age or older</b>.</span></label>
                    <div class="field">
                        <label class="check" style="margin-bottom:8px;cursor:default"><span>I am affiliated with the following type of institution:</span></label>
                        <select id="g-inst">
                            <option value="">Select institution type...</option>
                            <option value="university">University / Academic</option>
                            <option value="research">Research Laboratory</option>
                            <option value="clinical">Clinical / Medical Facility</option>
                            <option value="biotech">Biotech / Pharmaceutical Company</option>
                            <option value="government">Government Agency</option>
                            <option value="independent">Independent Researcher</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <button class="btn primary enter" id="g-enter" disabled>Enter Site</button>
                    <button class="decline" id="g-decline">I do not agree &mdash; leave site</button>
                    <p class="legal">By entering, you agree to our Terms of Use. Products are not intended to diagnose, treat, cure, or prevent any disease.</p>
                </div>
            </div>

            <header>
                <div class="container nav">
                    <a href="#top" class="logo"><span class="logo-mark" aria-label="PepX Research"><span class="logo-word"><span class="logo-pep">pep</span><span class="logo-x">X</span></span><span class="logo-sub">research</span></span></a>
                    <nav class="menu">
                        <a href="#top">Home</a>
                        <a href="#products">Shop</a>
                        <a href="#faq">FAQ</a>
                        <a href="#about">About</a>
                        <a href="#contact">Contact</a>
                    </nav>
                    <div class="icons">
                        <button type="button" id="accountBtn" class="icon-btn" title="Account" aria-label="Account">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M4 20c1.5-3.2 4.2-4.8 8-4.8s6.5 1.6 8 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>
                        </button>
                        <button type="button" class="icon-btn cart-btn" id="cartBtn" title="Cart" aria-label="Cart">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1.4" fill="currentColor"></circle><circle cx="18" cy="20" r="1.4" fill="currentColor"></circle><path d="M2 4h2l2.2 9.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L17 7H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                            <span class="cart-count" id="cartCount" style="display:none">0</span>
                        </button>
                    </div>
                </div>
            </header>

            <section class="hero container">
                <div>
                    <div class="badge"><span class="dot"></span>Trusted Peptide Supplier</div>
                    <h1>Peptides of the Highest <span class="accent">Research-Grade Purity</span></h1>
                    <p>Explore a wide range of peptides for research purposes. Premium quality, certified laboratory testing, and fast shipping nationwide.</p>
                    <div class="btns"><a href="#products" class="btn primary">Browse Catalog &#8594;</a><a href="#about" class="btn ghost">Learn More</a></div>
                    <div class="stats">
                        <div><div class="n">99.9%</div><div class="l">Peptide Purity</div></div>
                        <div><div class="n">10k+</div><div class="l">Satisfied Researchers</div></div>
                        <div><div class="n">24h</div><div class="l">Fast Shipping</div></div>
                    </div>
                </div>
                <div class="hero-art">
                    <div class="chip c1"><b>CJC-1295</b><small>5 mg</small><div class="price">From $94.99</div></div>
                    <div class="chip c2"><b>TB-500</b><small>10 mg</small><div class="price">From $59.99</div></div>
                    <div class="chip c3"><b>BPC-157</b><small>10 mg</small><div class="price">From $49.99</div></div>
                </div>
            </section>

            <section class="section container" id="products">
                <h2>Featured Research Peptides</h2>
                <p class="sub">Certified, lab-tested compounds for professional research applications.</p>
                <div class="grid" id="productGrid" data-product-grid></div>
            </section>

            <section class="section container" id="reviews">
                <h2>Leave a Review</h2>
                <p class="sub">Share your experience with our products and help others discover what we offer.</p>
                <form class="review-form" id="reviewForm" data-review-form>
                    <div class="review-row">
                        <label>
                            <span>Rating</span>
                            <div class="star-picker" role="radiogroup" aria-label="Select rating">
                                <button type="button" class="star-btn" data-value="1" aria-label="1 star">★</button>
                                <button type="button" class="star-btn" data-value="2" aria-label="2 stars">★</button>
                                <button type="button" class="star-btn" data-value="3" aria-label="3 stars">★</button>
                                <button type="button" class="star-btn" data-value="4" aria-label="4 stars">★</button>
                                <button type="button" class="star-btn" data-value="5" aria-label="5 stars">★</button>
                                <input type="hidden" name="rating" required>
                            </div>
                        </label>
                        <label>
                            <span>Name</span>
                            <input type="text" name="name" placeholder="Your name" required>
                        </label>
                        <label>
                            <span>Email</span>
                            <input type="email" name="email" placeholder="you@example.com" required>
                        </label>
                    </div>
                    <label>
                        <span>Review</span>
                        <textarea name="message" placeholder="Tell us about your experience" required></textarea>
                    </label>
                    <button type="submit" class="btn primary">Submit Review</button>
                </form>
                <div class="tgrid" id="reviewList" data-review-list></div>
            </section>

            <section class="section calc" id="faq">
                <div class="container">
                    <h2>Frequently Asked Questions</h2>
                    <p class="sub">Everything you need to know about ordering and handling.</p>
                    <div class="faq">
                        <div class="qa"><div class="q">Are your peptides third-party tested?<span class="ico">+</span></div><div class="a">Yes. Every batch is independently lab-tested for purity and identity, and a certificate of analysis is available for each product.</div></div>
                        <div class="qa"><div class="q">How should peptides be stored?<span class="ico">+</span></div><div class="a">Lyophilized peptides should be kept in a freezer. Once reconstituted, store refrigerated and use within the recommended window.</div></div>
                        <div class="qa"><div class="q">How fast is shipping?<span class="ico">+</span></div><div class="a">Orders placed before the daily cutoff ship the same day, with most domestic orders arriving within 24-72 hours.</div></div>
                        <div class="qa"><div class="q">What is your return policy?<span class="ico">+</span></div><div class="a">Due to the highly sensitive chemical nature of laboratory reagents and reference standards, all sales of PX Research LLC products are final. To maintain strict laboratory safety protocols and prevent cross-contamination, we absolutely cannot accept returns, exchanges, or refunds of opened, unsealed, or altered product vials under any circumstances. By completing your purchase, you acknowledge and agree that these products are raw chemical reagents and cannot be returned. If a shipment arrives physically damaged, broken, or incorrect due to a transit error, the buyer must contact our support team within 48 hours of delivery with photographic evidence to request a complimentary replacement shipment.</div></div>
                    </div>
                </div>
            </section>

            <section class="about section" id="about">
                <div class="container">
                    <div>
                        <div class="badge"><span class="dot"></span>About Us</div>
                        <h2>Committed to Purity & Precision</h2>
                        <p>PepX Research supplies research-grade compounds backed by third-party laboratory testing and rigorous quality control. Every batch is verified for purity so researchers can trust the integrity of their work.</p>
                        <p>Our mission is to make high-quality research compounds accessible, with transparent testing, secure packaging, and reliable fast shipping.</p>
                    </div>
                    <div class="art"></div>
                </div>
            </section>

            <section class="section contact" id="contact">
                <div class="container">
                    <h2>Get In Touch</h2>
                    <p class="sub">Questions about products or your order? Send us a message.</p>
                    <form class="cform" onsubmit="return submitForm(event)">
                        <div class="row"><input type="text" placeholder="Name" required><input type="email" placeholder="Email" required></div>
                        <input type="text" placeholder="Phone number (optional)">
                        <textarea placeholder="Your message" required></textarea>
                        <button type="submit" class="btn primary">Send Message</button>
                        <div class="form-msg">Thanks! Your message has been received.</div>
                    </form>
                </div>
            </section>

            <footer><div class="container">
                <div class="fgrid">
                    <div><div class="logo"><span class="logo-mark" aria-label="PepX Research"><span class="logo-word"><span class="logo-pep">pep</span><span class="logo-x">X</span></span><span class="logo-sub">research</span></span></div><p style="font-size:14px">Research-grade compounds with certified purity, trusted by thousands of researchers.</p></div>
                    <div><h4>Shop</h4><ul><li><a href="#products">All Peptides</a></li><li><a href="#products">Blends</a></li><li><a href="#products">Supplies</a></li><li><a href="#contact">Wholesale</a></li></ul></div>
                    <div><h4>Learn</h4><ul><li><a href="#faq">Research Guides</a></li><li><a href="#faq">FAQ</a></li><li><a href="#about">Lab Testing</a></li></ul></div>
                    <div><h4>Support</h4><ul><li><a href="#contact">Contact</a></li><li><a href="#faq">Shipping</a></li><li><a href="#faq">Returns</a></li><li><a href="#contact">Track Order</a></li></ul></div>
                </div>
                <div class="terms-section">
                    <h4>Terms and Conditions of B2B Sale</h4>
                    <p><strong>Last Updated:</strong> July 2026<br><strong>Company Entity:</strong> PX Research LLC</p>
                    <ol>
                        <li><strong>Scope of Agreement and Intent of Use</strong><br>By accessing, browsing, or purchasing from this website, the buyer explicitly agrees to be bound by these Terms and Conditions. All products distributed by PX Research LLC are supplied strictly for laboratory research, development, and analytical purposes only.</li>
                        <li><strong>Research Use Only (RUO) Material Declaration</strong><br><ul><li><strong>Strict Prohibition:</strong> Under no circumstances shall any products purchased from this storefront be used for human, veterinary, therapeutic, cosmetic, diagnostic, or dietary consumption.</li><li><strong>No Medical Applications:</strong> These products are raw chemical reagents and laboratory reference standards. They are not approved by the FDA or any global regulatory body for clinical use, medical treatment, or direct administration to humans or animals.</li><li><strong>Misuse Enforcement:</strong> Any communication, order note, or account activity implying that these products will be used for human administration or off-label application will result in the immediate termination of the order, permanent banning of the buyer's account, and a complete reversal of funds.</li></ul></li>
                        <li><strong>Buyer Qualifications and Age Restrictions</strong><br><ul><li><strong>Age Limitation:</strong> You must be at least 18 years of age to purchase from this website. By creating an account or checking out, you warrant that you are of legal age.</li><li><strong>Institutional Verification:</strong> The buyer warrants that they are affiliated with a legitimate laboratory, research university, educational institution, or private corporate research entity. PX Research LLC reserves the right to request proof of institutional affiliation or credentials prior to order fulfillment.</li></ul></li>
                        <li><strong>Hazard Warning and Material Handling</strong><br>The buyer acknowledges that the products sold may be hazardous if handled improperly. The buyer warrants that they possess the necessary scientific training, equipment, safety protocols, and laboratory ventilation systems required to safely store, handle, and test these chemical compounds.</li>
                        <li><strong>Indemnification and Limitation of Liability</strong><br>The buyer agrees to indemnify, defend, and hold harmless PX Research LLC, its managing members, officers, employees, and suppliers from and against any and all claims, damages, liabilities, costs, or legal actions resulting directly or indirectly from:<br><ul><li>The handling, storage, or chemical testing of the products.</li><li>Any misuse, misapplication, or accidental exposure to the products.</li><li>The buyer’s failure to comply with local, state, or federal environmental and chemical safety regulations.</li></ul></li>
                        <li><strong>Compliance with Laws</strong><br>The buyer assumes all responsibility for complying with local, state, and federal laws regarding the possession, handling, and import of chemical materials. PX Research LLC does not assume responsibility for packages seized by customs or local authorities due to regional regulatory restrictions.</li>
                        <li><strong>Governing Law</strong><br>This agreement, its interpretation, and all legal relationships arising out of your purchases shall be governed strictly by the laws of the <strong>State of Illinois</strong>, without regard to conflicts of laws principles. Any legal disputes must be filed exclusively in the courts located in Illinois.</li>
                    </ol>
                </div>
                <div class="copy">&copy; 2026 PepX Research. For research use only. Not for human consumption.</div>
            </footer>

            <div class="backdrop" id="backdrop"></div>
            <div class="product-modal" id="productModal" data-product-modal>
                <div class="product-modal-card">
                    <button class="product-modal-close" id="closeProductModal" data-product-modal-close type="button">&times;</button>
                    <div class="product-modal-body">
                        <div class="product-modal-image"></div>
                        <div class="product-modal-info">
                            <span class="tag" id="productModalTag"></span>
                            <h3 id="productModalTitle" data-product-title></h3>
                            <p class="product-modal-price" id="productModalPrice" data-product-price></p>
                            <p class="product-modal-description" data-product-description>Research-grade reagent for laboratory use only. Handle with appropriate controls and safety procedures.</p>
                            <div class="product-modal-qty">
                                <label for="productModalQty">Quantity</label>
                                <input type="number" id="productModalQty" min="1" value="1" data-product-qty>
                            </div>
                            <button class="btn primary" id="addProductModalBtn" data-product-confirm type="button">Add to Cart</button>
                        </div>
                    </div>
                </div>
            </div>
            <aside class="drawer" id="drawer" data-drawer>
                <div class="drawer-head"><h3>Your Cart</h3><button class="x" id="closeCart" data-drawer-close type="button">&times;</button></div>
                <div class="drawer-body" id="cartBody" data-cart-body><p class="cart-empty">Your cart is empty.</p></div>
                <div class="drawer-foot"><div class="tot"><span>Total</span><span id="cartTotal" data-cart-total>$0.00</span></div><button class="btn primary co" id="checkoutBtn">Checkout</button></div>
            </aside>
            <div class="toast" id="toast" data-toast></div>
        </div>
        <?php
        return ob_get_clean();
    }
}

new PepX_Research_Chemicals_Plugin();
