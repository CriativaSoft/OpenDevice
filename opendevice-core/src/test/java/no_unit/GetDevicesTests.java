/*
 * *****************************************************************************
 * Copyright (c) 2013-2014 CriativaSoft (www.criativasoft.com.br)
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 *  Contributors:
 *  Ricardo JL Rufino - Initial API and Implementation
 * *****************************************************************************
 */

package no_unit;

import br.com.criativasoft.opendevice.connection.AbstractStreamConnection;
import br.com.criativasoft.opendevice.connection.ConnectionListener;
import br.com.criativasoft.opendevice.connection.ConnectionStatus;
import br.com.criativasoft.opendevice.connection.DeviceConnection;
import br.com.criativasoft.opendevice.connection.message.Message;
import br.com.criativasoft.opendevice.core.LocalDeviceManager;
import br.com.criativasoft.opendevice.core.command.Command;
import br.com.criativasoft.opendevice.core.command.GetDevicesResponse;
import br.com.criativasoft.opendevice.core.connection.MultipleConnection;

import java.io.IOException;
import java.util.LinkedList;
import java.util.List;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.atomic.AtomicInteger;

// Test GetDevicesRequest between multiples re-connections
public class GetDevicesTests extends LocalDeviceManager implements ConnectionListener {

    private List<Command> receivedPartial = new LinkedList<Command>();

    public static void main( String[] args ) {
        launch(args);
    }

    @Override
    public void start() throws IOException {

        addConnectionListener(this);

        CommandLogViewer log = new CommandLogViewer();

        AbstractStreamConnection usb = out.usb();

        log.monitor(usb);

        connect(usb);

//        connect(out.bluetooth("00:11:06:14:04:57"));

    }

    @Override
    public void connectionStateChanged( final DeviceConnection connection , ConnectionStatus status ) {

    }

    @Override
    public void onMessageReceived( Message message , DeviceConnection connection ) {

        if (message instanceof GetDevicesResponse) {
            GetDevicesResponse response = (GetDevicesResponse) message;

            receivedPartial.add(response);
            System.err.println("Sync: " + receivedPartial.size() + "/" + response.getLength() + " ||| devices: " + getDevices().size());

        }

    }

}
