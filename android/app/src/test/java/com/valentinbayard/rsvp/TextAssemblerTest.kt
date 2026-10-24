package com.valentinbayard.rsvp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TextAssemblerTest {
    private val para1 = "Depuis quelques années, les méthodes de lecture rapide fleurissent sur les réseaux sociaux."
    private val para2 = "Leur promesse est simple : lire deux à trois fois plus vite, sans rien perdre du sens."

    @Test
    fun keepsTheArticleAndDropsAppChrome() {
        val blocks = listOf(
            Block("Le Monde", clickable = true),
            Block("Accueil", clickable = true),
            Block("International", clickable = true),
            Block("La lecture rapide n’est pas une course", heading = true),
            Block("Par Marie Dupont"),
            Block(para1),
            Block("Partager", clickable = true),
            Block("Lire aussi : notre dossier sur la lecture", clickable = true),
            Block("Les étapes", heading = true),
            Block(para2),
            Block("Commentaires", clickable = true),
            Block("Articles similaires", heading = true),
        )
        val a = TextAssembler.assemble(blocks)
        assertEquals("La lecture rapide n’est pas une course", a.title)
        assertEquals(listOf(para1, "Les étapes", para2), a.paragraphs)
        assertEquals(listOf(1), a.headings)
    }

    @Test
    fun removesDuplicatesFromOverlappingScrollPasses() {
        val a = TextAssembler.assemble(listOf(Block(para1), Block(para2), Block(para1)))
        assertEquals(listOf(para1, para2), a.paragraphs)
    }

    @Test
    fun shortTextWithoutProseIsKept() {
        val a = TextAssembler.assemble(listOf(Block("OK", clickable = true), Block("On se voit demain à midi")))
        assertEquals(listOf("On se voit demain à midi"), a.paragraphs)
    }

    @Test
    fun joinsInlinePiecesWithSensibleSpacing() {
        assertEquals("Le président Macron a dit, « non ».",
            TextAssembler.joinInline(listOf("Le président", "Macron", "a dit, «", "non", "».")))
        assertEquals("l’Europe", TextAssembler.joinInline(listOf("l’", "Europe")))
        assertEquals("deux mots", TextAssembler.joinInline(listOf("deux ", "mots")))
    }

    @Test
    fun cleansInvisibleCharacters() {
        val s = TextAssembler.clean("lec\u00ADture   rapide\u200B")
        assertEquals("lecture rapide", s)
        assertTrue(TextAssembler.words(s) == 2)
        assertFalse(s.contains('\u00AD'))
    }
}
