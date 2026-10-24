package com.valentinbayard.rsvp

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * Hosts the reader (the web app from /web, bundled in the APK) and routes
 * texts coming from other apps to it.
 */
class MainActivity : Activity() {

    lateinit var web: WebView
        private set
    private lateinit var container: FrameLayout
    private var pageLoaded = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        container = FrameLayout(this)
        container.setBackgroundColor(PAPER)
        web = WebView(this)
        web.setBackgroundColor(PAPER)
        container.addView(web, FrameLayout.LayoutParams(-1, -1))
        setContentView(container)
        applyInsets()

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = true
            textZoom = 100
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                // Links in the app (e.g. "download") open in the real browser.
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (_: Exception) {
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageLoaded = true
            }
        }
        web.addJavascriptInterface(WebBridge(this), "RSVPNative")

        handleIntent(intent)
        web.loadUrl("https://$HOST/assets/web/index.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
        if (pageLoaded) web.evaluateJavascript("window.__rsvp && __rsvp.checkPayload()", null)
    }

    /** Turns any incoming intent into a payload for the page (see app.js handleIncoming). */
    private fun handleIntent(intent: Intent?) {
        intent ?: return
        val payload = when (intent.action) {
            ACTION_READ_PAYLOAD -> return // already in PayloadStore
            Intent.ACTION_SEND -> JSONObject()
                .put("title", intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: intent.getStringExtra(Intent.EXTRA_TITLE) ?: "")
                .put("text", intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: "")
            Intent.ACTION_PROCESS_TEXT -> JSONObject()
                .put("text", intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString() ?: "")
            Intent.ACTION_VIEW -> intent.data?.let { JSONObject().put("url", it.toString()) }
            else -> null
        } ?: return
        PayloadStore.put(payload.put("external", true).toString())
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (!pageLoaded) {
            @Suppress("DEPRECATION")
            super.onBackPressed()
            return
        }
        web.evaluateJavascript("window.__rsvp ? String(__rsvp.back()) : 'false'") { handled ->
            if (handled != "\"true\"") moveTaskToBack(true)
        }
    }

    override fun onResume() {
        super.onResume()
        if (pageLoaded) web.evaluateJavascript("window.__rsvp && __rsvp.refreshSetup()", null)
    }

    override fun onStop() {
        super.onStop()
        if (pageLoaded) web.evaluateJavascript("window.__rsvp && __rsvp.pause()", null)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    // ---- Called by WebBridge, on the main thread ----

    fun setKeepScreenOn(on: Boolean) {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    fun setDarkTheme(dark: Boolean) {
        val bg = if (dark) INK_BG else PAPER
        container.setBackgroundColor(bg)
        web.setBackgroundColor(bg)
        @Suppress("DEPRECATION")
        window.statusBarColor = bg
        @Suppress("DEPRECATION")
        window.navigationBarColor = bg
        if (Build.VERSION.SDK_INT >= 30) {
            val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (dark) 0 else light, light)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = if (dark) 0 else
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
    }

    fun deliverExtraction(id: String, json: String) {
        web.evaluateJavascript("window.__rsvp && __rsvp.extracted(${JSONObject.quote(id)}, ${JSONObject.quote(json)})", null)
    }

    fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: Exception) {
        }
    }

    /** Keeps content clear of the status/navigation bars and the keyboard (edge-to-edge on Android 15). */
    private fun applyInsets() {
        container.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime() or WindowInsets.Type.displayCutout())
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
    }

    companion object {
        const val ACTION_READ_PAYLOAD = "com.valentinbayard.rsvp.READ_PAYLOAD"
        const val HOST = "appassets.androidplatform.net"
        val PAPER = Color.parseColor("#F2EEE3")
        val INK_BG = Color.parseColor("#14130F")
    }
}
