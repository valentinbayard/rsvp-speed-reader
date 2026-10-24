package com.valentinbayard.rsvp

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import org.json.JSONTokener

/**
 * Loads a link in an off-screen WebView and pulls the article out with
 * Readability. The WebView shares its cookies with [BrowserActivity], so a
 * site you logged into there is fetched as a subscriber.
 */
class ArticleExtractor(private val context: Context) {

    private val main = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    fun extract(url: String, done: (String) -> Unit) {
        val web = WebView(context)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.blockNetworkImage = true
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        var finished = false
        val runExtraction = Runnable {
            if (finished) return@Runnable
            web.evaluateJavascript(script(context)) { result ->
                finish(web, decode(result) ?: error("extraction"), done) { finished = true }
            }
        }
        val timeout = Runnable {
            if (!finished) {
                // Out of patience: take whatever has rendered so far.
                web.evaluateJavascript(script(context)) { result ->
                    finish(web, decode(result) ?: error("timeout"), done) { finished = true }
                }
            }
        }

        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, loadedUrl: String) {
                // Give client-side rendering a moment; restart the wait on redirects.
                main.removeCallbacks(runExtraction)
                main.postDelayed(runExtraction, 1500)
            }

            override fun onReceivedError(view: WebView, errorCode: Int, description: String?, failingUrl: String?) {
                if (failingUrl == url) finish(web, error(description ?: "network"), done) { finished = true }
            }
        }
        main.postDelayed(timeout, 25_000)
        web.loadUrl(url)
    }

    private fun finish(web: WebView, json: String, done: (String) -> Unit, markDone: () -> Unit) {
        markDone()
        main.post {
            web.stopLoading()
            web.destroy()
        }
        done(json)
    }

    private fun decode(result: String?): String? = try {
        JSONTokener(result ?: "null").nextValue() as? String
    } catch (_: Exception) {
        null
    }

    private fun error(msg: String) = JSONObject().put("error", msg).toString()

    companion object {
        private var cached: String? = null

        /** Readability + our extraction helper, then call it; evaluates to a JSON string. */
        fun script(context: Context): String {
            cached?.let { return it }
            val assets = context.assets
            val readability = assets.open("web/vendor/Readability.js").bufferedReader().use { it.readText() }
            val extract = assets.open("web/core/extract.js").bufferedReader().use { it.readText() }
            return ("(function(){$readability\n;window.Readability=Readability;})();\n$extract\n" +
                "JSON.stringify(window.__rsvpExtract({selection: false}))").also { cached = it }
        }

        fun scriptWithSelection(context: Context): String =
            script(context).replace("__rsvpExtract({selection: false})", "__rsvpExtract({selection: true})")
    }
}
