import React, { useEffect, useRef } from 'react';
import Codemirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import ACTIONS from '../actions/Actions';
import { useRecoilValue } from 'recoil';
import { language, cmtheme } from '../../src/atoms';

const Editor = ({ socketRef, roomId, onCodeChange, hasWriteAccess }) => {
    const editorRef = useRef(null);
    const lang = useRecoilValue(language);
    const theme = useRecoilValue(cmtheme);

    useEffect(() => {
        async function init() {
            if (!editorRef.current) {
                editorRef.current = Codemirror.fromTextArea(
                    document.getElementById('realtimeEditor'),
                    {
                        mode: { name: lang, json: true },
                        theme: theme,
                        autoCloseTags: true,
                        autoCloseBrackets: true,
                        lineNumbers: true,
                        readOnly: !hasWriteAccess
                    }
                );

                editorRef.current.on('change', (instance, changes) => {
                    const { origin } = changes;
                    const code = instance.getValue();
                    onCodeChange(code);
                    if (origin !== 'setValue' && hasWriteAccess) {
                        socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                            roomId,
                            code,
                        });
                    }
                });
            }

            // Update editor options when write access changes
            editorRef.current.setOption('readOnly', !hasWriteAccess);
        }
        init();

        return () => {
            // Cleanup function
            if (editorRef.current) {
                // Remove the editor instance
                editorRef.current.toTextArea();
                editorRef.current = null;

                // Remove the event listener
                // socketRef.current.off(ACTIONS.CODE_CHANGE);
            }
        };
    }, [hasWriteAccess]); // Only re-run when hasWriteAccess changes

    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on(ACTIONS.CODE_CHANGE, ({code}) => {
                if (code !== null) {
                    console.log(code);
                    editorRef.current.setValue(code);
                }
            });
        }

        return () => {
            socketRef.current.off(ACTIONS.CODE_CHANGE);
        };
    }, [socketRef.current]);

    return <textarea id="realtimeEditor"></textarea>;
};

export default Editor;