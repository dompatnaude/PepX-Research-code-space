(function () {
  'use strict';

  function safeReturnTo(value, fallback) {
    var raw = String(value || '').trim();
    if (!raw.startsWith('/')) return fallback;
    if (raw.startsWith('//')) return fallback;
    if (raw.indexOf('://') !== -1) return fallback;
    return raw;
  }

  function qs(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (err) {
      return null;
    }
  }

  function request(path, options) {
    var req = options || {};
    req.credentials = 'include';
    req.headers = req.headers || {};
    if (!(req.body instanceof FormData)) {
      req.headers['Content-Type'] = req.headers['Content-Type'] || 'application/json';
    }
    return fetch(path, req).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var error = new Error(data.error || 'Request failed');
          error.status = res.status;
          throw error;
        }
        return data;
      });
    });
  }

  function setMessage(id, text, tone) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('error', 'success');
    if (tone) el.classList.add(tone);
  }

  function clearFieldErrors(form) {
    if (!form) return;
    form.querySelectorAll('[data-error-for]').forEach(function (el) {
      el.textContent = '';
    });
  }

  function setFieldError(form, fieldName, text) {
    if (!form) return;
    var el = form.querySelector('[data-error-for="' + fieldName + '"]');
    if (el) el.textContent = text || '';
  }

  function attachPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach(function (button) {
      button.addEventListener('click', function () {
        var input = button.parentElement && button.parentElement.querySelector('input');
        if (!input) return;
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        button.textContent = showing ? 'Show' : 'Hide';
      });
    });
  }

  function applyReturnToLinks(returnTo) {
    document.querySelectorAll('a[href="login.html"], a[href="register.html"]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      link.href = href + '?returnTo=' + encodeURIComponent(returnTo);
    });
  }

  function initGoogleButtons(returnTo) {
    request('/api/auth/config', { method: 'GET' }).then(function (data) {
      if (!data || !data.googleConfigured) return;
      var href = '/auth/google?next=' + encodeURIComponent(returnTo);
      var loginBtn = document.getElementById('loginGoogleBtn');
      var registerBtn = document.getElementById('registerGoogleBtn');
      var loginDivider = document.getElementById('loginGoogleDivider');
      var registerDivider = document.getElementById('registerGoogleDivider');
      if (loginBtn) {
        loginBtn.hidden = false;
        loginBtn.addEventListener('click', function () { window.location.href = href; });
      }
      if (registerBtn) {
        registerBtn.hidden = false;
        registerBtn.addEventListener('click', function () { window.location.href = href; });
      }
      if (loginDivider) loginDivider.hidden = false;
      if (registerDivider) registerDivider.hidden = false;
    }).catch(function () {});
  }

  function initLogin(returnTo) {
    var form = document.getElementById('loginFormPage');
    if (!form) return;
    var returnField = document.getElementById('loginReturnTo');
    if (returnField) returnField.value = returnTo;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearFieldErrors(form);
      setMessage('loginPageMessage', '', '');

      var fd = new FormData(form);
      var email = String(fd.get('email') || '').trim();
      var password = String(fd.get('password') || '');
      var hasError = false;

      if (!email) {
        setFieldError(form, 'email', 'Email is required.');
        hasError = true;
      }
      if (!password) {
        setFieldError(form, 'password', 'Password is required.');
        hasError = true;
      }
      if (hasError) return;

      request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          password: password,
          rememberMe: !!fd.get('rememberMe')
        })
      }).then(function () {
        window.location.href = returnTo;
      }).catch(function (error) {
        setMessage('loginPageMessage', error.message || 'Unable to sign in.', 'error');
      });
    });
  }

  function initRegister(returnTo) {
    var form = document.getElementById('registerFormPage');
    if (!form) return;
    var returnField = document.getElementById('registerReturnTo');
    if (returnField) returnField.value = returnTo;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearFieldErrors(form);
      setMessage('registerPageMessage', '', '');

      var fd = new FormData(form);
      var email = String(fd.get('email') || '').trim();
      var birthday = String(fd.get('birthday') || '').trim();
      var password = String(fd.get('password') || '');
      var confirmPassword = String(fd.get('confirmPassword') || '');
      var businessType = String(fd.get('businessType') || '').trim();
      var hasError = false;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldError(form, 'email', 'Enter a valid email address.');
        hasError = true;
      }
      if (password.length < 8) {
        setFieldError(form, 'password', 'Password must be at least 8 characters.');
        hasError = true;
      }
      if (password !== confirmPassword) {
        setFieldError(form, 'confirmPassword', 'Passwords must match.');
        hasError = true;
      }
      if (!businessType) {
        setFieldError(form, 'businessType', 'Select a business type.');
        hasError = true;
      }
      if (hasError) return;

      request('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          birthday: birthday || null,
          password: password,
          confirmPassword: confirmPassword,
          businessType: businessType
        })
      }).then(function () {
        window.location.href = returnTo;
      }).catch(function (error) {
        setMessage('registerPageMessage', error.message || 'Unable to create account.', 'error');
      });
    });
  }

  function initForgotPassword() {
    var form = document.getElementById('forgotPasswordForm');
    if (!form) return;
    var devLink = document.getElementById('forgotPasswordDevLink');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearFieldErrors(form);
      setMessage('forgotPasswordMessage', '', '');
      if (devLink) devLink.innerHTML = '';

      var fd = new FormData(form);
      var email = String(fd.get('email') || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldError(form, 'email', 'Enter a valid email address.');
        return;
      }

      request('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email: email })
      }).then(function (data) {
        setMessage('forgotPasswordMessage', data.message || 'If the account exists, reset instructions have been prepared.', 'success');
        if (devLink && data && data.debugResetPath) {
          devLink.innerHTML = 'Development reset link: <a href="' + data.debugResetPath + '">' + data.debugResetPath + '</a>';
        }
      }).catch(function (error) {
        setMessage('forgotPasswordMessage', error.message || 'Unable to process reset request.', 'error');
      });
    });
  }

  function initResetPassword() {
    var form = document.getElementById('resetPasswordForm');
    if (!form) return;
    var token = String(qs('token') || '').trim();
    var tokenField = document.getElementById('resetPasswordToken');
    if (tokenField) tokenField.value = token;
    if (!token) {
      setMessage('resetPasswordMessage', 'This password reset link is invalid or missing a token.', 'error');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearFieldErrors(form);
      setMessage('resetPasswordMessage', '', '');

      var fd = new FormData(form);
      var password = String(fd.get('password') || '');
      var confirmPassword = String(fd.get('confirmPassword') || '');
      var currentToken = String(fd.get('token') || '').trim();
      var hasError = false;

      if (!currentToken) {
        setMessage('resetPasswordMessage', 'This password reset link is invalid or missing a token.', 'error');
        return;
      }
      if (password.length < 8) {
        setFieldError(form, 'password', 'Password must be at least 8 characters.');
        hasError = true;
      }
      if (password !== confirmPassword) {
        setFieldError(form, 'confirmPassword', 'Passwords must match.');
        hasError = true;
      }
      if (hasError) return;

      request('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: currentToken,
          password: password,
          confirmPassword: confirmPassword
        })
      }).then(function (data) {
        setMessage('resetPasswordMessage', data.message || 'Your password has been updated.', 'success');
        window.setTimeout(function () {
          window.location.href = 'login.html';
        }, 1200);
      }).catch(function (error) {
        setMessage('resetPasswordMessage', error.message || 'Unable to reset password.', 'error');
      });
    });
  }

  var authPage = document.body.getAttribute('data-auth-page');
  if (!authPage) return;

  var returnTo = safeReturnTo(qs('returnTo'), '/index.html');
  applyReturnToLinks(returnTo);
  attachPasswordToggles();
  initGoogleButtons(returnTo);
  initLogin(returnTo);
  initRegister(returnTo);
  initForgotPassword();
  initResetPassword();

  // Unified auth page (auth.html) — tab switching between login and register
  if (authPage === 'auth') {
    initAuthTabs();
  }

  function setAuthView(view) {
    var loginPanel = document.getElementById('authLoginPanel');
    var registerPanel = document.getElementById('authRegisterPanel');
    var loginTab = document.querySelector('[data-auth-tab="login"]');
    var registerTab = document.querySelector('[data-auth-tab="register"]');
    var isRegister = view === 'register';

    if (loginPanel) loginPanel.hidden = isRegister;
    if (registerPanel) registerPanel.hidden = !isRegister;
    if (loginTab) {
      loginTab.classList.toggle('active', !isRegister);
      loginTab.setAttribute('aria-selected', String(!isRegister));
    }
    if (registerTab) {
      registerTab.classList.toggle('active', isRegister);
      registerTab.setAttribute('aria-selected', String(isRegister));
    }
  }

  function initAuthTabs() {
    // Honour ?view=register on initial load
    var view = qs('view') || 'login';
    setAuthView(view);

    // Tab buttons
    document.querySelectorAll('[data-auth-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-auth-tab');
        setAuthView(target);
        // Update URL query so a page refresh stays on the right tab
        try {
          var url = new URL(window.location.href);
          url.searchParams.set('view', target);
          window.history.replaceState({}, '', url.toString());
        } catch (e) {}
      });
    });

    // "Don't have an account? Register" / "Already have an account? Login" links
    document.querySelectorAll('[data-auth-tab-link]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var target = link.getAttribute('data-auth-tab-link');
        setAuthView(target);
        try {
          var url = new URL(window.location.href);
          url.searchParams.set('view', target);
          window.history.replaceState({}, '', url.toString());
        } catch (e) {}
      });
    });
  }
})();
