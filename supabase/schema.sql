-- Enable UUID generation if it is not already enabled in the Supabase project.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Global dictionary of common words.
CREATE TABLE IF NOT EXISTS global_words (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word TEXT UNIQUE NOT NULL,
    translation TEXT NOT NULL,
    difficulty_level TEXT CHECK (difficulty_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    frequency_rank INT,
    phonetic TEXT,
    example_sentence TEXT
);

-- User-specific progress.
CREATE TABLE IF NOT EXISTS user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    word_id UUID REFERENCES global_words(id),
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'learning', 'mastered')),
    ease_factor FLOAT DEFAULT 2.5,
    interval INT DEFAULT 0,
    next_review TIMESTAMPTZ DEFAULT NOW(),
    last_reviewed TIMESTAMPTZ,
    UNIQUE(user_id, word_id)
);

ALTER TABLE global_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read global words" ON global_words;
CREATE POLICY "Allow read global words" ON global_words FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage their own progress" ON user_progress;
CREATE POLICY "Users can manage their own progress" ON user_progress
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_progress_next_review_idx
    ON user_progress (user_id, next_review);

CREATE INDEX IF NOT EXISTS global_words_frequency_rank_idx
    ON global_words (frequency_rank);

CREATE INDEX IF NOT EXISTS global_words_difficulty_level_idx
    ON global_words (difficulty_level);

-- Helper view: Due words for a user, randomized order
CREATE OR REPLACE VIEW due_words_for_user AS
SELECT 
    gw.id AS word_id,
    gw.word,
    gw.translation,
    gw.difficulty_level,
    gw.frequency_rank,
    gw.phonetic,
    gw.example_sentence,
    up.status,
    up.ease_factor,
    up.interval,
    up.next_review,
    up.last_reviewed
FROM global_words gw
LEFT JOIN user_progress up ON gw.id = up.word_id
WHERE up.next_review IS NULL OR up.next_review <= NOW()
ORDER BY RANDOM();

-- Function to fetch due words with randomization
CREATE OR REPLACE FUNCTION get_due_words(p_user_id UUID, p_limit INT DEFAULT 20)
RETURNS TABLE (
    word_id UUID,
    word TEXT,
    translation TEXT,
    difficulty_level TEXT,
    frequency_rank INT,
    phonetic TEXT,
    example_sentence TEXT,
    status TEXT,
    ease_factor FLOAT,
    interval INT,
    next_review TIMESTAMPTZ,
    last_reviewed TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gw.id,
        gw.word,
        gw.translation,
        gw.difficulty_level,
        gw.frequency_rank,
        gw.phonetic,
        gw.example_sentence,
        COALESCE(up.status, 'new'),
        COALESCE(up.ease_factor, 2.5),
        COALESCE(up.interval, 0),
        COALESCE(up.next_review, NOW()),
        up.last_reviewed
    FROM global_words gw
    LEFT JOIN user_progress up ON gw.id = up.word_id AND up.user_id = p_user_id
    WHERE up.id IS NULL OR up.next_review <= NOW()
    ORDER BY RANDOM()
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;