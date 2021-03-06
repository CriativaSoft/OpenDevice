
/*
 * ******************************************************************************
 *  Copyright (c) 2013-2014 CriativaSoft (www.criativasoft.com.br)
 *  All rights reserved. This program and the accompanying materials
 *  are made available under the terms of the Eclipse Public License v1.0
 *  which accompanies this distribution, and is available at
 *  http://www.eclipse.org/legal/epl-v10.html
 *
 *  Contributors:
 *  Ricardo JL Rufino - Initial API and Implementation
 * *****************************************************************************
 */

package br.com.criativasoft.opendevice.wsrest.io;

import org.atmosphere.cpr.AtmosphereResourceEvent;
import org.atmosphere.websocket.WebSocketEventListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class WSEventsLogger implements WebSocketEventListener {

    private static final Logger logger = LoggerFactory.getLogger(WSEventsLogger.class);

    public WSEventsLogger() {
    }

    @Override
    public void onPreSuspend(AtmosphereResourceEvent event) {
    }

    public void onSuspend(final AtmosphereResourceEvent event) {
        logger.info("Connected: {} - {}", event.getResource().getRequest().getRemoteAddr()
                + ":" + event.getResource().getRequest().getRemotePort(), event.getResource().uuid());
    }

    public void onResume(AtmosphereResourceEvent event) {
        logger.info("{} - {}", event.getResource().getRequest().getRemoteAddr()
                + ":" + event.getResource().getRequest().getRemotePort(), event.getResource().uuid());
    }

    public void onDisconnect(AtmosphereResourceEvent event) {
        logger.info("{} - {}", event.getResource().getRequest().getRemoteAddr()
                + ":" + event.getResource().getRequest().getRemotePort(), event.getResource().uuid());
    }

    public void onBroadcast(AtmosphereResourceEvent event) {
        if (logger.isTraceEnabled()) logger.trace("onBroadcast(): {}", event.getMessage());
    }

    public void onHeartbeat(AtmosphereResourceEvent event) {
        logger.info("onHeartbeat(): {}", event.getMessage());
    }

    public void onThrowable(AtmosphereResourceEvent event) {
        logger.warn("onThrowable(): {}", event);
    }

    @Override
    public void onClose(AtmosphereResourceEvent event) {
        logger.info("onClose(): {}", event.getMessage());

    }

    public void onHandshake(WebSocketEvent event) {
        logger.info("onHandshake(): {}", event);
    }

    public void onMessage(WebSocketEvent event) {
        if (logger.isDebugEnabled()) logger.debug("onMessage(): {}", event.message());
    }

    public void onClose(WebSocketEvent event) {
        logger.info("onClose(): {}", event);
    }

    public void onControl(WebSocketEvent event) {
        logger.info("onControl(): {}", event);
    }

    public void onDisconnect(WebSocketEvent event) {
//        logger.info("onDisconnect(): {}", event);
    }

    public void onConnect(WebSocketEvent event) {
        // logger.info("onConnect(): {}", event);
    }
}
