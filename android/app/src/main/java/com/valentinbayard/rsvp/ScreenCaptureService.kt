package com.valentinbayard.rsvp

import android.accessibilityservice.AccessibilityButtonController
import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject

/**
 * "Read this screen": when the user taps the accessibility button (or the
 * quick settings tile), grab the text of the app in front and open the reader.
 *
 * This is what makes paywalled articles readable: we read what the user's
 * own, logged-in app displays, instead of fetching the page again.
 */
class ScreenCaptureService : AccessibilityService() {

    private val main = Handler(Looper.getMainLooper())
    private lateinit var worker: Handler
    private var thread: HandlerThread? = null
    @Volatile private var busy = false

    private val buttonCallback = object : AccessibilityButtonController.AccessibilityButtonCallback() {
        override fun onClicked(controller: AccessibilityButtonController) = capture(fromTile = false)
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        thread = HandlerThread("screen-capture").also { it.start() }
        worker = Handler(thread!!.looper)
        accessibilityButtonController.registerAccessibilityButtonCallback(buttonCallback)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        cleanup()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        cleanup()
        super.onDestroy()
    }

    private fun cleanup() {
        if (instance === this) instance = null
        try {
            accessibilityButtonController.unregisterAccessibilityButtonCallback(buttonCallback)
        } catch (_: Exception) {
        }
        thread?.quitSafely()
        thread = null
    }

    fun capture(fromTile: Boolean) {
        if (busy || thread == null) return
        busy = true
        toast(getString(R.string.capturing))
        worker.post {
            val result = try {
                if (fromTile) {
                    // Let the notification shade close so the app is in front again.
                    if (Build.VERSION.SDK_INT >= 31) {
                        performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
                    }
                    Thread.sleep(700)
                }
                ScreenTextCollector(this).collect()
            } catch (e: Exception) {
                null
            }
            main.post {
                busy = false
                handleResult(result)
            }
        }
    }

    private fun handleResult(result: ScreenTextCollector.Result?) {
        if (result == null) {
            toast(getString(R.string.nothing_found))
            return
        }
        if (result.packageName == packageName) {
            toast(getString(R.string.open_article_first))
            return
        }
        val article = TextAssembler.assemble(result.blocks)
        if (article.paragraphs.isEmpty()) {
            toast(getString(R.string.nothing_found))
            return
        }
        val payload = JSONObject()
            .put("title", article.title ?: "")
            .put("paragraphs", JSONArray(article.paragraphs))
            .put("headings", JSONArray(article.headings))
            .put("source", appLabel(result.packageName))
            .put("external", true)
        PayloadStore.put(payload.toString())
        startActivity(
            Intent(this, MainActivity::class.java)
                .setAction(MainActivity.ACTION_READ_PAYLOAD)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
    }

    private fun appLabel(pkg: String?): String? = try {
        pkg?.let { packageManager.getApplicationLabel(packageManager.getApplicationInfo(it, 0)).toString() }
    } catch (_: Exception) {
        null
    }

    private fun toast(text: String) = main.post { Toast.makeText(this, text, Toast.LENGTH_SHORT).show() }

    companion object {
        @Volatile var instance: ScreenCaptureService? = null
            private set

        fun isEnabled(ctx: android.content.Context): Boolean {
            val enabled = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
                ?: return false
            val me = "${ctx.packageName}/${ScreenCaptureService::class.java.name}"
            val meShort = "${ctx.packageName}/.${ScreenCaptureService::class.java.simpleName}"
            return enabled.split(':').any { it.equals(me, true) || it.equals(meShort, true) }
        }
    }
}
