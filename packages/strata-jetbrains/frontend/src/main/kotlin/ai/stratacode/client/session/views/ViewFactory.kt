package ai.stratacode.client.session.views

import ai.stratacode.client.session.model.Compaction
import ai.stratacode.client.session.model.Content
import ai.stratacode.client.session.model.Generic
import ai.stratacode.client.session.model.Reasoning
import ai.stratacode.client.session.model.Text
import ai.stratacode.client.session.model.Tool

/**
 * Creates the appropriate [PartView] for a given [Content] subtype.
 *
 * Adding a new content type means:
 * 1. Add a subclass of [Content] in the model.
 * 2. Add a [PartView] subclass in this package.
 * 3. Add a branch here — the exhaustive `when` will surface the gap as a compile error.
 */
object ViewFactory {
    fun create(content: Content): PartView = when (content) {
        is Text -> TextView(content)
        is Reasoning -> ReasoningView(content)
        is Tool -> ToolView(content)
        is Compaction -> CompactionView(content)
        is Generic -> GenericView(content)
    }
}
