package com.valentinbayard.rsvp

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * `window.RSVPNative` in the page. Methods are called on a WebView binder
 * thread, so anything touching views is posted to the main thread.
 */
class WebBridge(private val activity: MainActivity) {

    private val extractor by lazy { ArticleExtractor(activity) }

    private fun ui(block: () -> Unit) = activity.runOnUiThread(block)

    /** The text waiting to be read (JSON), if another app just sent one. */
    @JavascriptInterface
    fun takePayload(): String? = PayloadStore.take()

    @JavascriptInterface
    fun isScreenCaptureEnabled(): Boolean = ScreenCaptureService.isEnabled(activity)

    @JavascriptInterface
    fun openScreenCaptureSettings() = ui {
        val component = "${activity.packageName}/${ScreenCaptureService::class.java.name}"
        val details = Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS")
            .putExtra(Intent.EXTRA_COMPONENT_NAME, component)
        val generic = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        try {
            activity.startActivity(if (Build.VERSION.SDK_INT >= 33) details else generic)
        } catch (_: Exception) {
            activity.startActivity(generic)
        }
    }

    /** Android 13+ blocks accessibility for sideloaded apps until allowed from App info. */
    @JavascriptInterface
    fun openAppInfo() = ui {
        activity.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}")),
        )
    }

    @JavascriptInterface
    fun needsRestrictedSettingsHint(): Boolean = Build.VERSION.SDK_INT >= 33

    @JavascriptInterface
    fun extractUrl(id: String, url: String) = ui {
        extractor.extract(url) { json -> activity.deliverExtraction(id, json) }
    }

    @JavascriptInterface
    fun openBrowser(url: String) = ui {
        activity.startActivity(Intent(activity, BrowserActivity::class.java).putExtra(BrowserActivity.EXTRA_URL, url))
    }

    @JavascriptInterface
    fun readClipboard(): String {
        // The clipboard may only be read from the main thread of the focused app.
        var text = ""
        val done = CountDownLatch(1)
        ui {
            try {
                val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                text = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(activity)?.toString() ?: ""
            } catch (_: Exception) {
            }
            done.countDown()
        }
        done.await(2, TimeUnit.SECONDS)
        return text
    }

    @JavascriptInterface
    fun setReading(on: Boolean) = ui { activity.setKeepScreenOn(on) }

    @JavascriptInterface
    fun setDarkTheme(dark: Boolean) = ui { activity.setDarkTheme(dark) }

    /** Reader closed after reading something from another app: go back to that app. */
    @JavascriptInterface
    fun leave() = ui { activity.moveTaskToBack(true) }

    @JavascriptInterface
    fun openLink(url: String) = ui { activity.openExternal(Uri.parse(url)) }
}
