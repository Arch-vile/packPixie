import { useState, useEffect, useCallback } from 'react';
import config from './config';

interface Comment {
  id: string;
  text: string;
  createdAt: string;
}

export default function Comments() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = config.apiUrl;

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/comments`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: { comments: Comment[] } = await response.json();
      setComments(data.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  const addComment = async () => {
    const text = newComment.trim();
    if (!text) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      setNewComment('');
      await fetchComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  return (
    <div
      style={{
        margin: '20px',
        padding: '20px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        textAlign: 'left',
      }}
    >
      <h2>Comments</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addComment()}
          placeholder="Write a comment..."
          disabled={submitting}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            fontSize: '14px',
          }}
        />
        <button
          onClick={addComment}
          disabled={submitting || !newComment.trim()}
          style={{
            padding: '8px 16px',
            backgroundColor: submitting ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Adding...' : 'Add'}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: '12px',
            padding: '10px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            borderRadius: '4px',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#666' }}>Loading comments...</p>
      ) : comments.length === 0 ? (
        <p style={{ color: '#666' }}>No comments yet. Be the first!</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {comments.map((comment) => (
            <li
              key={comment.id}
              style={{
                padding: '10px',
                marginBottom: '8px',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                borderLeft: '3px solid #007bff',
              }}
            >
              <p style={{ margin: '0 0 4px 0', color: 'black' }}>
                {comment.text}
              </p>
              <small style={{ color: '#888' }}>
                {new Date(comment.createdAt).toLocaleString()}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
