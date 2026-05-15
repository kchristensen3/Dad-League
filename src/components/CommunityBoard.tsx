import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  deleteDoc,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { compressImage } from '../lib/imageUtils';
import { Post, Comment } from '../types';
import { MessageSquare, Heart, Image as ImageIcon, Send, Trash2, User as UserIcon, X, Globe, ExternalLink, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function CommunityBoard({ user, leagueId }: { user: User, leagueId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<Post['linkPreview'] | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);

  useEffect(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = newPostContent.match(urlRegex);
    
    if (match && match[0] !== linkPreview?.url) {
      const url = match[0];
      const timer = setTimeout(async () => {
        setIsFetchingPreview(true);
        try {
          const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
          if (res.ok) {
            const data = await res.json();
            setLinkPreview(data);
          }
        } catch (err) {
          console.error("Preview fetch err:", err);
        } finally {
          setIsFetchingPreview(false);
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else if (!match) {
      setLinkPreview(null);
    }
  }, [newPostContent, linkPreview?.url]);

  useEffect(() => {
    if (!user || !leagueId) return;
    const q = query(
      collection(db, 'posts'), 
      where('leagueId', '==', leagueId),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Post)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'posts'));
    return () => unsubscribe();
  }, [user, leagueId]);

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImageError(null);
    if (file) {
      setIsReadingImage(true);
      try {
        // Auto compress image
        const compressedBase64 = await compressImage(file, 1200, 1200, 0.6);
        
        // 500KB limit for base64 to stay safely under Firestore 1MB document limit
        if (compressedBase64.length > 600 * 1024) {
          setImageError("Image is too large (max 500KB). Even after compression, it's over the limit.");
          setIsReadingImage(false);
          return;
        }
        
        setNewImageUrl(compressedBase64);
      } catch (err) {
        console.error("Compression error:", err);
        setImageError("Failed to process image. Try another one.");
      } finally {
        setIsReadingImage(false);
        if (e.target) {
          e.target.value = '';
        }
      }
    }
  };

  const handleCreatePost = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() || !newPostTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'posts'), {
        leagueId,
        authorId: user.uid,
        authorName: user.displayName || 'Anonymous Dad',
        authorPhoto: user.photoURL || '',
        title: newPostTitle,
        content: newPostContent,
        imageUrl: newImageUrl,
        linkPreview: linkPreview || null,
        likes: [],
        createdAt: serverTimestamp()
      });
      setNewPostTitle('');
      setNewPostContent('');
      setNewImageUrl('');
      setLinkPreview(null);
      setIsPosting(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'posts');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleLike = async (post: Post) => {
    const postRef = doc(db, 'posts', post.id);
    const isLiked = post.likes.includes(user.uid);
    try {
      await updateDoc(postRef, {
        likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${postId}`);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="fixed bottom-24 right-6 md:right-12 z-40">
        <button 
          onClick={() => setIsPosting(!isPosting)}
          className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center hover:bg-indigo-700 shadow-2xl active:scale-95 shadow-indigo-200 transition-all border-4 border-white"
        >
          {isPosting ? <X size={24} /> : <Plus size={24} />}
        </button>
      </div>

      <AnimatePresence>
        {isPosting && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="p-6 bg-white rounded-2xl border border-slate-200 shadow-2xl space-y-6"
          >
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="font-black text-xl tracking-tight text-slate-800 uppercase">New Board Post</h3>
              <button onClick={() => setIsPosting(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={20}/></button>
            </div>
            <form onSubmit={handleCreatePost} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Post Title</label>
                <input 
                  value={newPostTitle}
                  onChange={e => setNewPostTitle(e.target.value)}
                  placeholder="Give your post a title..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Details</label>
                <textarea 
                  value={newPostContent}
                  onChange={e => setNewPostContent(e.target.value)}
                  placeholder="Share advice, a win, or a joke with the dads..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[150px] shadow-inner leading-relaxed"
                />
              </div>

              <AnimatePresence>
                {(linkPreview || isFetchingPreview) && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-4 animate-in fade-in slide-in-from-top-2">
                      {isFetchingPreview ? (
                        <div className="flex items-center gap-3 text-indigo-400">
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full"
                          />
                          <span className="text-[10px] font-black uppercase tracking-widest">Generating smart preview...</span>
                        </div>
                      ) : linkPreview && (
                        <>
                          {linkPreview.image && (
                            <img src={linkPreview.image} className="w-20 h-20 rounded-lg object-cover shrink-0 shadow-sm" alt="" />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-black text-slate-800 text-sm truncate">{linkPreview.title}</h4>
                            <p className="text-slate-500 text-xs line-clamp-2 mt-1">{linkPreview.description}</p>
                            <div className="flex items-center gap-1 mt-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                              <Globe size={10} /> {new URL(linkPreview.url).hostname}
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setLinkPreview(null)}
                            className="p-1 h-fit text-slate-400 hover:text-slate-600"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <div className="flex justify-between items-center pl-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ">Attachment (Optional)</label>
                  {imageError && <span className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{imageError}</span>}
                </div>
                {newImageUrl ? (
                  <div className="relative rounded-xl overflow-hidden group shadow-lg">
                    <img src={newImageUrl} className="w-full h-48 object-cover" alt="Upload preview" />
                    <button 
                      type="button"
                      onClick={() => {
                        setNewImageUrl('');
                        setImageError(null);
                      }}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg"
                    >
                      <X size={16} />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/50 to-transparent text-white text-[10px] font-black uppercase tracking-widest">
                      Ready to share
                    </div>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center w-full h-32 px-4 transition bg-slate-50 border-2 ${imageError ? 'border-red-200 bg-red-50' : 'border-slate-200 border-dashed'} rounded-xl appearance-none cursor-pointer hover:border-indigo-400 hover:bg-slate-100 focus:outline-none group shadow-inner relative`}>
                    {isReadingImage ? (
                      <div className="flex flex-col items-center space-y-2">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"
                        />
                        <span className="font-bold text-xs text-indigo-500 uppercase tracking-widest">Processing...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-2">
                        <ImageIcon className={`w-8 h-8 ${imageError ? 'text-red-400' : 'text-slate-400 group-hover:text-indigo-500'} transition-colors`} />
                        <span className={`font-bold text-xs ${imageError ? 'text-red-400' : 'text-slate-400 group-hover:text-indigo-500'} transition-colors`}>
                          {imageError ? 'Try a different image' : 'Upload image (Auto-compressed)'}
                        </span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isReadingImage}
                    />
                  </label>
                )}
              </div>
              <button 
                disabled={isSubmitting}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                    />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    Publish to League
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-8">
        {posts.map(post => (
          <PostCard 
            key={post.id} 
            post={post} 
            user={user} 
            onLike={() => handleToggleLike(post)} 
            onDelete={() => handleDeletePost(post.id)} 
          />
        ))}
      </div>
    </div>
  );
}

function PostCard({ post, user, onLike, onDelete }: { post: Post, user: User, onLike: () => any, onDelete: () => any, key?: any }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'posts', post.id, 'comments'), 
      where('leagueId', '==', post.leagueId),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
    }, (err) => handleFirestoreError(err, OperationType.GET, `posts/${post.id}/comments`));
    return () => unsubscribe();
  }, [post.id, post.leagueId, user]);

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        postId: post.id,
        leagueId: post.leagueId, // Include leagueId for rule validation
        authorId: user.uid,
        authorName: user.displayName || 'Anonymous Dad',
        authorPhoto: user.photoURL || '',
        text: newCommentText,
        createdAt: serverTimestamp()
      });
      setNewCommentText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/comments`);
    }
  };

  const isLiked = post.likes.includes(user.uid);

  return (
    <motion.div 
      layout
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:border-indigo-300 transition-all"
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src={post.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.authorId}`} 
              className="w-10 h-10 rounded-xl border-2 border-slate-50 shadow-sm" 
              alt={post.authorName}
              referrerPolicy="no-referrer"
            />
            <div>
              <p className="font-bold text-slate-800 text-sm leading-none">{post.authorName}</p>
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">
                {post.createdAt?.toDate().toLocaleDateString()}
              </p>
            </div>
          </div>
          {post.authorId === user.uid && (
            <div className="flex items-center gap-1">
              <AnimatePresence>
                {isDeleting && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-2"
                  >
                    <button 
                      onClick={onDelete}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
                    >
                      Confirm
                    </button>
                    <button 
                      onClick={() => setIsDeleting(false)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              {!isDeleting && (
                <button 
                  onClick={() => setIsDeleting(true)} 
                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-xl font-black tracking-tight text-slate-900 leading-tight">
            {post.title}
          </h3>
          <p className="text-slate-600 text-base leading-relaxed whitespace-pre-wrap">
            {post.content}
          </p>
        </div>

        {post.linkPreview && (
          <a 
            href={post.linkPreview.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-white transition-all group"
          >
            <div className="flex flex-col sm:flex-row gap-4">
              {post.linkPreview.image && (
                <div className="sm:w-32 shrink-0 h-24 rounded-xl overflow-hidden shadow-sm">
                  <img src={post.linkPreview.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">
                  <Globe size={10} /> {new URL(post.linkPreview.url).hostname}
                </div>
                <h4 className="text-base font-black text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                  {post.linkPreview.title}
                </h4>
                {post.linkPreview.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1 font-medium leading-normal italic">
                    "{post.linkPreview.description}"
                  </p>
                )}
              </div>
            </div>
          </a>
        )}

        {post.imageUrl && (
          <div className="rounded-xl overflow-hidden border border-slate-100">
            <img src={post.imageUrl} alt="Post content" className="w-full object-cover max-h-[400px]" referrerPolicy="no-referrer" />
          </div>
        )}

        <div className="flex items-center gap-6 pt-4 border-t border-slate-50">
          <button 
            onClick={onLike}
            className={`flex items-center gap-2 group transition-all ${isLiked ? 'text-red-500' : 'text-slate-400 hover:text-red-500'}`}
          >
            <div className={`p-2 rounded-lg group-hover:bg-red-50 ${isLiked ? 'bg-red-50' : ''}`}>
              <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
            </div>
            <span className="font-bold text-xs">{post.likes.length}</span>
          </button>
          
          <button 
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-2 group text-slate-400 hover:text-indigo-600 transition-all"
          >
            <div className="p-2 rounded-lg group-hover:bg-indigo-50">
              <MessageSquare size={18} />
            </div>
            <span className="font-bold text-xs">{comments.length}</span>
          </button>
        </div>

        <AnimatePresence>
          {showComments && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 pt-4 overflow-hidden"
            >
              <div className="space-y-3">
                {comments.map(comment => (
                  <div key={comment.id} className="flex gap-3 items-start p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <img 
                      src={comment.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.authorId}`} 
                      className="w-7 h-7 rounded-lg shrink-0 shadow-sm" 
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-0.5">{comment.authorName}</p>
                      <p className="text-xs text-slate-700 font-medium leading-relaxed">{comment.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2">
                <input 
                  value={newCommentText}
                  onChange={e => setNewCommentText(e.target.value)}
                  placeholder="Drop a comment..."
                  className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button 
                  type="submit"
                  className="p-3 bg-indigo-600 text-white rounded-lg shadow-lg shadow-indigo-50 active:scale-95"
                >
                  <Send size={14} />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
