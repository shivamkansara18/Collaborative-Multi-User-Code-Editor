import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import Client from '../components/Client';
import Editor from '../components/Editor'
import { language, cmtheme } from '../../src/atoms';
import { useRecoilState } from 'recoil';
import ACTIONS from '../actions/Actions';
import { initSocket } from '../socket';
import { useLocation, useNavigate, Navigate, useParams } from 'react-router-dom';
import '../editorPage.css'

const EditorPage = () => {
    const [lang, setLang] = useRecoilState(language);
    const [them, setThem] = useRecoilState(cmtheme);
    const [clients, setClients] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [hasWriteAccess, setHasWriteAccess] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]);

    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();

    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();
            socketRef.current.on('connect_error', (err) => handleErrors(err));
            socketRef.current.on('connect_failed', (err) => handleErrors(err));

            function handleErrors(e) {
                console.log('socket error', e);
                toast.error('Socket connection failed, try again later.');
                reactNavigator('/');
            }

            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });

            // Listening for joined event
            socketRef.current.on(
                ACTIONS.JOINED,
                ({ clients, username, socketId }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                    }
                    setClients(clients);
                    // Update host and write access status
                    const currentClient = clients.find(client => client.socketId === socketRef.current.id);
                    setIsHost(currentClient?.isHost || false);
                    setHasWriteAccess(currentClient?.hasWriteAccess || false);

                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                    });
                }
            );

            // Listen for write access requests (host only)
            socketRef.current.on(
                ACTIONS.WRITE_ACCESS_REQUEST,
                ({ socketId, username }) => {
                    setPendingRequests(prev => [...prev, { socketId, username }]);
                    toast.success(`${username} requested write access`);
                }
            );

            // Listen for write access changes
            socketRef.current.on(ACTIONS.WRITE_ACCESS_GRANTED, () => {
                setHasWriteAccess(true);
                toast.success('Write access granted!');
            });

            socketRef.current.on(ACTIONS.WRITE_ACCESS_DENIED, () => {
                setHasWriteAccess(false);
                toast.error('Write access denied');
            });

            socketRef.current.on(ACTIONS.WRITE_ACCESS_REVOKED, () => {
                setHasWriteAccess(false);
                toast.error('Write access revoked');
            });

            // Listen for write access changes for all clients
            socketRef.current.on(ACTIONS.WRITE_ACCESS_CHANGED, ({ socketId }) => {
                setClients(prevClients =>
                    prevClients.map(client => ({
                        ...client,
                        hasWriteAccess: client.socketId === socketId
                    }))
                );
            });

            // Listen for new host assignment
            socketRef.current.on(ACTIONS.NEW_HOST, ({ socketId }) => {
                if (socketId === socketRef.current.id) {
                    setIsHost(true);
                    toast.success('You are now the host');
                }
                setClients(prevClients =>
                    prevClients.map(client => ({
                        ...client,
                        isHost: client.socketId === socketId
                    }))
                );
            });

            // Listening for disconnected
            socketRef.current.on(
                ACTIONS.DISCONNECTED,
                ({ socketId, username }) => {
                    toast.success(`${username} left the room.`);
                    setClients((prev) => {
                        return prev.filter(
                            (client) => client.socketId !== socketId
                        );
                    });
                    // Remove any pending requests from this user
                    setPendingRequests(prev =>
                        prev.filter(request => request.socketId !== socketId)
                    );
                }
            );
        };
        init();
        return () => {
            socketRef.current.off(ACTIONS.JOINED);
            socketRef.current.off(ACTIONS.DISCONNECTED);
            socketRef.current.off(ACTIONS.WRITE_ACCESS_REQUEST);
            socketRef.current.off(ACTIONS.WRITE_ACCESS_GRANTED);
            socketRef.current.off(ACTIONS.WRITE_ACCESS_DENIED);
            socketRef.current.off(ACTIONS.WRITE_ACCESS_REVOKED);
            socketRef.current.off(ACTIONS.WRITE_ACCESS_CHANGED);
            socketRef.current.off(ACTIONS.NEW_HOST);
            socketRef.current.disconnect();
        };
    }, []);

    const handleWriteAccessRequest = () => {
        socketRef.current.emit(ACTIONS.REQUEST_WRITE_ACCESS, { roomId });
        toast.success('Write access requested');
    };

    const handleAccessResponse = (socketId, granted) => {
        socketRef.current.emit(ACTIONS.WRITE_ACCESS_RESPONSE, {
            roomId,
            requestingSocketId: socketId,
            granted
        });
        setPendingRequests(prev =>
            prev.filter(request => request.socketId !== socketId)
        );
    };

    const handleRevokeAccess = (socketId) => {
        socketRef.current.emit(ACTIONS.REVOKE_WRITE_ACCESS, {
            roomId,
            targetSocketId: socketId,
        });
    };

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied to clipboard');
        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className="mainWrap">
            {/* <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img
                            className="logoImage"
                            src="/logo.png"
                            alt="logo"
                        />
                    </div>
                    <h3>Connected</h3>
                    <div className="clientsList">
                        {clients.map((client) => (
                            <div key={client.socketId} className="clientItem">
                                <Client
                                    username={client.username}
                                    isHost={client.isHost}
                                    hasWriteAccess={client.hasWriteAccess}
                                />
                                {isHost && client.hasWriteAccess && !client.isHost && (
                                    <button
                                        className="btn revokeBtn"
                                        onClick={() => handleRevokeAccess(client.socketId)}
                                    >
                                        Revoke Access
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {!isHost && !hasWriteAccess && (
                        <button className="btn copyBtn" onClick={handleWriteAccessRequest}>
                            Request Write Access
                        </button>
                    )}

                    {isHost && pendingRequests.length > 0 && (
                        <div className="pendingRequests">
                            <h4>Pending Requests:</h4>
                            {pendingRequests.map((request) => (
                                <div key={request.socketId} className="requestItem">
                                    <span>{request.username}</span>
                                    <div>
                                        <button
                                            className="btn acceptBtn"
                                            onClick={() => handleAccessResponse(request.socketId, true)}
                                        >
                                            Accept
                                        </button>
                                        <button
                                            className="btn rejectBtn"
                                            onClick={() => handleAccessResponse(request.socketId, false)}
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <label>
                    Select Language:
                    <select value={lang} onChange={(e) => { setLang(e.target.value); window.location.reload(); }} className="seLang">
                        <option value="javascript">javascript</option>
                    </select>
                </label>

                <label>
                    Select Theme:
                    <select value={them} onChange={(e) => { setThem(e.target.value); window.location.reload(); }} className="seLang">
                        <option value="monokai">monokai</option>
                    </select>
                </label>

                <button className="btn copyBtn" onClick={copyRoomId}>
                    Copy ROOM ID
                </button>
                <button className="btn leaveBtn" onClick={leaveRoom}>
                    Leave
                </button>
            </div> */}

            <div className='sidebar'>
                <div className="header">
                    <svg className="icon" viewBox="0 0 24 24" width="24" height="24">
                        <path fill="none" d="M0 0h24v24H0z" />
                        <path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l-1 1v2h12v-2l-1-1h3c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z" fill="currentColor" />
                    </svg>
                    <span>SYNC CODE</span>
                </div>
                <div className="section">
                    <h2>Connected</h2>
                    <div className="user-list">
                        {clients.map((client) => (
                            <div key={client.socketId} className={`user-item ${socketRef.current.id === client.socketId ? "highlighted-class" : ""}`}>
                                <Client
                                    username={client.username}
                                />
                                <div className="user-info">
                                    <span className="user-name">{client.username}</span>
                                    {client.isHost && <span className="badge host">Host</span>}
                                    {client.hasWriteAccess && <span className="badge can-edit">Write</span>}
                                </div>
                                {isHost && client.hasWriteAccess && !client.isHost && (
                                    <button className="button revoke" onClick={() => handleRevokeAccess(client.socketId)}>
                                        Revoke
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {isHost && pendingRequests.length > 0 && (
                    <div className="user-list" style={{background: "black"}}>
                        <h4>Pending Requests:</h4>
                        {pendingRequests.map((request) => (
                            <div key={request.socketId} className="request-card">
                                <div className="request-user">
                                    <Client username={request.username} />
                                    <span className='user-name'>{request.username}</span>
                                    <div className='request-actions'>
                                        <button
                                            className="button accept"
                                            onClick={() => handleAccessResponse(request.socketId, true)}
                                        >
                                            Accept
                                        </button>
                                        <button
                                            className="button reject"
                                            onClick={() => handleAccessResponse(request.socketId, false)}
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="section">
                    <label htmlFor="language-select">Select Language:</label>
                    <select
                        id="language-select"
                        value={lang}
                        onChange={(e) => { setLang(e.target.value); window.location.reload(); }}
                    >
                        <option value="javascript">javascript</option>
                    </select>
                </div>

                <div className="section">
                    <label htmlFor="theme-select">Select Theme:</label>
                    <select
                        id="theme-select"
                        value={them}
                        onChange={(e) => { setThem(e.target.value); window.location.reload(); }}
                    >
                        <option value="monokai">monokai</option>
                    </select>
                </div>

                <div className="footer">
                    {!isHost && !hasWriteAccess && (
                        <button className="button secondary" onClick={handleWriteAccessRequest}>
                            Request Write Access
                        </button>
                    )}
                    <button className="button secondary" onClick={copyRoomId}>Copy ROOM ID</button>
                    <button className="button danger" onClick={leaveRoom}>Leave</button>
                </div>
            </div>

            <div className="editorWrap">
                <Editor
                    socketRef={socketRef}
                    roomId={roomId}
                    onCodeChange={(code) => {
                        codeRef.current = code;
                    }}
                    hasWriteAccess={hasWriteAccess}
                />
            </div>
        </div>
    );
}

export default EditorPage;