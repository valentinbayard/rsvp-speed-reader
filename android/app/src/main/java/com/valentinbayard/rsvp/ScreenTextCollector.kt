package com.valentinbayard.rsvp

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.os.Build
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

/**
 * Reads the text of the app in front, through the accessibility tree.
 *
 * Web content (Chrome, and WebViews inside news apps) labels each node with
 * its HTML role, so a paragraph made of text + links + emphasis can be put
 * back together. Native apps expose one node per TextView.
 *
 * When the app only exposes what is on screen (lists that recycle their
 * views), we scroll it to collect the rest.
 */
class ScreenTextCollector(private val service: AccessibilityService) {

    class Result(val packageName: String?, val blocks: List<Block>)

    private val ownPackage = service.packageName

    /** Must not run on the main thread: it sleeps while the app scrolls. */
    fun collect(): Result? {
        val root = findAppRoot() ?: return null
        val pkg = root.packageName?.toString()
        if (pkg == ownPackage) return Result(pkg, emptyList())

        val blocks = ArrayList<Block>()
        walk(root, blocks, 0)

        // Everything we found is on screen: the app probably only exposes what is
        // visible, so scroll down and keep collecting.
        val lastVisible = blocks.indexOfLast { it.visible }
        val hiddenAfter = lastVisible >= 0 && blocks.drop(lastVisible + 1).any { !it.visible && it.text.length > 40 }
        if (!hiddenAfter) {
            val merged = LinkedHashMap<String, Block>()
            blocks.forEach { merged.putIfAbsent(it.text, it) }
            var quietPasses = 0
            for (pass in 0 until MAX_SCROLLS) {
                val scroller = findScrollable(findAppRoot() ?: break) ?: break
                if (!scroller.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) break
                Thread.sleep(SCROLL_SETTLE_MS)
                val fresh = ArrayList<Block>()
                walk(findAppRoot() ?: break, fresh, 0)
                var added = 0
                for (b in fresh) if (merged.putIfAbsent(b.text, b) == null) added++
                quietPasses = if (added == 0) quietPasses + 1 else 0
                if (quietPasses >= 2 || merged.values.sumOf { it.text.length } > MAX_CHARS) break
            }
            return Result(pkg, merged.values.toList())
        }
        return Result(pkg, blocks)
    }

    private fun findAppRoot(): AccessibilityNodeInfo? {
        val windows = try {
            service.windows
        } catch (e: Exception) {
            emptyList<AccessibilityWindowInfo>()
        }
        val apps = windows.filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
        val bounds = Rect()
        val best = apps.firstOrNull { it.isActive && it.root?.packageName != ownPackage }
            ?: apps.filter { it.root?.packageName != ownPackage }
                .maxByOrNull { it.getBoundsInScreen(bounds); bounds.width() * bounds.height() }
        return best?.root ?: service.rootInActiveWindow
    }

    private fun findScrollable(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var best: AccessibilityNodeInfo? = null
        var bestArea = 0
        val r = Rect()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 5000) {
            val n = queue.removeFirst()
            visited++
            if (n.isScrollable && n.isVisibleToUser) {
                n.getBoundsInScreen(r)
                val area = r.width() * r.height()
                if (area > bestArea) {
                    best = n
                    bestArea = area
                }
            }
            for (i in 0 until n.childCount) n.getChild(i)?.let(queue::add)
        }
        return best
    }

    private fun role(n: AccessibilityNodeInfo): String? =
        n.extras?.getCharSequence(CHROME_ROLE)?.toString()

    private fun isHeading(n: AccessibilityNodeInfo, role: String?): Boolean =
        role == "heading" || (Build.VERSION.SDK_INT >= 28 && n.isHeading)

    private fun walk(n: AccessibilityNodeInfo, out: MutableList<Block>, depth: Int) {
        if (depth > MAX_DEPTH || out.size > MAX_BLOCKS) return
        val role = role(n)
        if (role != null && role in SKIP_ROLES) return
        if (role != null && role in BLOCK_ROLES) {
            val parts = ArrayList<String>()
            inline(n, parts, depth)
            val text = TextAssembler.joinInline(parts)
            if (text.isNotBlank()) out.add(Block(text, isHeading(n, role), n.isVisibleToUser, clickable = role == "link"))
            return
        }
        val text = n.text?.toString()
        if (n.childCount == 0) {
            if (!text.isNullOrBlank() && !n.isPassword) {
                val clickable = n.isClickable || n.className?.contains("Button") == true ||
                    role == "link" || role == "button"
                out.add(Block(text, isHeading(n, role), n.isVisibleToUser, clickable))
            }
            return
        }
        for (i in 0 until n.childCount) n.getChild(i)?.let { walk(it, out, depth + 1) }
    }

    /** Text of a web paragraph, from its inline children. */
    private fun inline(n: AccessibilityNodeInfo, parts: MutableList<String>, depth: Int) {
        if (depth > MAX_DEPTH) return
        val role = role(n)
        if (role != null && role in SKIP_ROLES) return
        if (n.childCount == 0) {
            n.text?.toString()?.let { if (it.isNotEmpty()) parts.add(it) }
            return
        }
        val before = parts.size
        for (i in 0 until n.childCount) n.getChild(i)?.let { inline(it, parts, depth + 1) }
        if (parts.size == before) n.text?.toString()?.let { if (it.isNotBlank()) parts.add(it) }
    }

    companion object {
        private const val CHROME_ROLE = "AccessibilityNodeInfo.chromeRole"
        private val BLOCK_ROLES = setOf(
            "paragraph", "heading", "listItem", "blockquote", "pre", "definition", "term",
            "descriptionListTerm", "descriptionListDetail", "caption",
        )
        private val SKIP_ROLES = setOf("image", "figure", "navigation", "banner", "contentInfo", "complementary", "button", "form", "dialog", "alertDialog", "menu", "menuBar", "toolbar", "tabList")
        private const val MAX_DEPTH = 120
        private const val MAX_BLOCKS = 6000
        private const val MAX_SCROLLS = 40
        private const val MAX_CHARS = 300_000
        private const val SCROLL_SETTLE_MS = 450L
    }
}
