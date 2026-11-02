"""Keyword-aware re-ranking of semantic mentor candidates.

BGE similarity decides *who* is eligible (the similarity threshold still
applies, so an off-topic query still returns nothing). Within those
candidates, a BM25 keyword ranking over each mentor's indexed profile text is
fused with the semantic ranking by Reciprocal Rank Fusion (RRF):

    score(d) = 1 / (RRF_K + semantic_rank(d)) + KEYWORD_WEIGHT / (RRF_K + keyword_rank(d))

RRF only uses rank positions, so the two scores never need to share a scale.
Pure Python: the corpus is a few hundred profiles, so no index service is needed.
"""
import math
import re
from collections import Counter

RRF_K = 60
KEYWORD_WEIGHT = 1.0
BM25_K1 = 1.2
BM25_B = 0.75
STOPWORDS = frozenset("""a an and are as at be been by can do for from has have help i i'd i'm in into is it its me my of on or
our so that the their them they this to want was we what when where which who will with would you your like move moving
get going make more about after also been being how just new next now one other out over really some than then there
these through up very""".split())
TOKEN = re.compile(r"[a-z0-9]+")


def tokens(text):
    """Lowercase word tokens without stopwords, with a light plural/suffix fold."""
    result = []
    for word in TOKEN.findall((text or "").lower()):
        if word in STOPWORDS or len(word) < 2:
            continue
        for suffix in ("ing", "ies", "es", "s"):
            if len(word) > len(suffix) + 3 and word.endswith(suffix):
                word = word[: -len(suffix)] + ("y" if suffix == "ies" else "")
                break
        result.append(word)
    return result


class BM25:
    def __init__(self, documents):
        """documents: mapping of id -> text."""
        self.ids = list(documents)
        self.docs = [Counter(tokens(documents[i])) for i in self.ids]
        self.lengths = [sum(d.values()) for d in self.docs]
        self.average = (sum(self.lengths) / len(self.lengths)) if self.lengths else 0.0
        frequency = Counter(term for d in self.docs for term in d)
        n = len(self.docs)
        self.idf = {term: math.log(1 + (n - df + 0.5) / (df + 0.5)) for term, df in frequency.items()}

    def scores(self, query):
        terms = set(tokens(query))
        out = {}
        for doc_id, doc, length in zip(self.ids, self.docs, self.lengths):
            score = 0.0
            for term in terms:
                tf = doc.get(term)
                if tf:
                    norm = tf + BM25_K1 * (1 - BM25_B + BM25_B * length / (self.average or 1))
                    score += self.idf[term] * tf * (BM25_K1 + 1) / norm
            if score > 0:
                out[doc_id] = score
        return out


def fuse(semantic_ids, keyword_scores, top_k):
    """semantic_ids: candidate ids in semantic order (already threshold-filtered).
    Returns up to top_k ids re-ranked by RRF; ties keep semantic order."""
    keyword_order = sorted((i for i in semantic_ids if i in keyword_scores), key=lambda i: (-keyword_scores[i], semantic_ids.index(i)))
    keyword_rank = {doc_id: rank for rank, doc_id in enumerate(keyword_order, start=1)}
    def score(doc_id):
        semantic_rank = semantic_ids.index(doc_id) + 1
        value = 1 / (RRF_K + semantic_rank)
        if doc_id in keyword_rank:
            value += KEYWORD_WEIGHT / (RRF_K + keyword_rank[doc_id])
        return value
    return sorted(semantic_ids, key=lambda i: (-score(i), semantic_ids.index(i)))[:top_k]
