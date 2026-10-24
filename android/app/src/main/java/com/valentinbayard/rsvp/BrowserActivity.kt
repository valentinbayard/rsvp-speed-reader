package com.valentinbayard.rsvp

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import org.json.JSONTokener

/**
 * A small browser for links that need a login (paywalls). Cookies persist,
 * so logging in once is enough. "Lire" reads the current page — or the
 * selected text, if any.
 */
class BrowserActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var titleView: TextView
    private lateinit var progress: ProgressBar

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL) ?: return finish()

        val paper = MainActivity.PAPER
        val ink = Color.parseColor("#171512")
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(paper)
        }

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(4), dp(10), dp(4))
        }
        val close = TextView(this).apply {
            text = "✕"
            textSize = 20f
            setTextColor(Color.parseColor("#5C574F"))
            gravity = Gravity.CENTER
            setOnClickListener { finish() }
        }
        bar.addView(close, LinearLayout.LayoutParams(dp(48), dp(48)))
        titleView = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.parseColor("#5C574F"))
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            text = getString(R.string.browser_hint)
        }
        bar.addView(titleView, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val read = TextView(this).apply {
            text = getString(R.string.browser_read)
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(paper)
            gravity = Gravity.CENTER
            setPadding(dp(20), 0, dp(20), 0)
            background = GradientDrawable().apply {
                cornerRadius = dp(20).toFloat()
                setColor(ink)
            }
            setOnClickListener { readPage() }
        }
        bar.addView(read, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)))
        root.addView(bar)

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#A3232A"))
        }
        root.addView(progress, LinearLayout.LayoutParams(-1, dp(3)))

        web = WebView(this)
        root.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        val frame = FrameLayout(this)
        frame.addView(root)
        setContentView(frame)
        frame.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                v.setPadding(b.left, b.top, b.right, b.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportMultipleWindows(false)
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val scheme = request.url.scheme
                if (scheme == "http" || scheme == "https") return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (_: Exception) {
                }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.alpha = if (newProgress >= 100) 0f else 1f
            }

            override fun onReceivedTitle(view: WebView, title: String?) {
                if (!title.isNullOrBlank()) titleView.text = title
            }
        }
        web.loadUrl(url)
    }

    private fun readPage() {
        web.evaluateJavascript(ArticleExtractor.scriptWithSelection(this)) { result ->
            val json = try {
                JSONTokener(result ?: "null").nextValue() as? String
            } catch (_: Exception) {
                null
            }
            val data = json?.let { runCatching { JSONObject(it) }.getOrNull() }
            val paragraphs = data?.optJSONArray("paragraphs")
            if (data == null || paragraphs == null || paragraphs.length() == 0) {
                Toast.makeText(this, R.string.browser_no_text, Toast.LENGTH_SHORT).show()
                return@evaluateJavascript
            }
            data.put("url", web.url)
            PayloadStore.put(data.toString())
            startActivity(
                Intent(this, MainActivity::class.java)
                    .setAction(MainActivity.ACTION_READ_PAYLOAD)
                    .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            )
            finish()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    companion object {
        const val EXTRA_URL = "url"
    }
}
