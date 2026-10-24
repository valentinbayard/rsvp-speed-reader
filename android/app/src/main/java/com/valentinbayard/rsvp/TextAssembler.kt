package com.valentinbayard.rsvp

/**
 * A piece of text found on screen, in reading order.
 *
 * @param heading   the source said it is a heading
 * @param visible   currently on screen (false for parts of a web page scrolled away)
 * @param clickable a button, tab or menu entry rather than prose
 */
data class Block(
    val text: String,
    val heading: Boolean = false,
    val visible: Boolean = true,
    val clickable: Boolean = false,
)

data class Article(val title: String?, val paragraphs: List<String>, val headings: List<Int>)

/**
 * Turns everything an app shows (toolbars, tabs, buttons, the article, related
 * links…) into just the article. Pure Kotlin so it can be unit-tested.
 */
object TextAssembler {
    private val SENTENCE_END = Regex("""[.!?…:;»”"')\]]$""")
    private val WHITESPACE = Regex("""[\s\u00A0]+""")
    private val INVISIBLE = Regex("""[\u200B\u200C\u200D\uFEFF\u00AD]""")

    fun words(s: String) = if (s.isBlank()) 0 else s.trim().split(WHITESPACE).size

    private fun isProse(b: Block): Boolean {
        val n = words(b.text)
        return n >= 12 || (n >= 5 && SENTENCE_END.containsMatchIn(b.text) && !b.clickable)
    }

    fun clean(s: String) = s.replace(INVISIBLE, "").replace(WHITESPACE, " ").trim()

    fun assemble(raw: List<Block>): Article {
        val seen = HashSet<String>()
        val blocks = raw.mapNotNull { b ->
            val t = clean(b.text)
            if (t.isEmpty() || !seen.add(t)) null else b.copy(text = t)
        }
        if (blocks.isEmpty()) return Article(null, emptyList(), emptyList())

        val first = blocks.indexOfFirst(::isProse)
        if (first < 0) {
            // No prose at all (a short message, a list…): keep whatever is not UI chrome.
            val kept = blocks.filter { !it.clickable && words(it.text) >= 3 }.ifEmpty { blocks }
            return Article(null, kept.map { it.text }, emptyList())
        }
        val last = blocks.indexOfLast(::isProse)

        // The title is the last heading shortly before the first paragraph or,
        // failing that, the last short line that does not read like a sentence.
        val window = (first - 1) downTo maxOf(0, first - 6)
        val titleIndex = window.firstOrNull { blocks[it].heading }
            ?: window.firstOrNull { i ->
                val b = blocks[i]
                !b.clickable && words(b.text) in 3..30 && !b.text.endsWith(".")
            }
            ?: -1
        val title = if (titleIndex >= 0) blocks[titleIndex].text else null

        val paragraphs = ArrayList<String>()
        val headings = ArrayList<Int>()
        // A subtitle/lede between the title and the first paragraph is worth keeping.
        if (titleIndex >= 0) {
            for (i in titleIndex + 1 until first) {
                val b = blocks[i]
                if (!b.clickable && words(b.text) >= 6) paragraphs.add(b.text)
            }
        }
        for (i in first..last) {
            val b = blocks[i]
            val n = words(b.text)
            val keep = isProse(b) ||
                (b.heading && n in 1..20) ||
                (!b.clickable && n >= 4 && SENTENCE_END.containsMatchIn(b.text))
            if (!keep) continue
            if (b.heading && !isProse(b)) headings.add(paragraphs.size)
            paragraphs.add(b.text)
        }
        return Article(title, paragraphs, headings)
    }

    /**
     * Joins inline pieces of one paragraph (text, links, emphasis) that the
     * accessibility tree reports separately.
     */
    fun joinInline(parts: List<String>): String {
        val sb = StringBuilder()
        for (p in parts) {
            if (p.isEmpty()) continue
            if (sb.isNotEmpty()) {
                val prev = sb.last()
                val next = p.first()
                val glue = !(prev.isWhitespace() || next.isWhitespace() ||
                    next in ",.;:!?)]}”’…%" || prev in "([{“‘'’-/")
                if (glue) sb.append(' ')
            }
            sb.append(p)
        }
        return sb.toString()
    }
}
