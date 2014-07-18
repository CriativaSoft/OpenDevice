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

package br.com.criativasoft.opendevice.atemospherews.guice.config;

import com.sun.jersey.api.model.AbstractResourceMethod;
import com.sun.jersey.server.impl.inject.InjectableValuesProvider;
import com.sun.jersey.server.impl.model.method.dispatch.AbstractResourceMethodDispatchProvider;

import javax.ws.rs.ext.Provider;

/**
 * TODO: PENDING DOC
 *
 * @autor Ricardo JL Rufino
 * @date 05/07/14.
 */
@Provider
public class DispatchProvider extends AbstractResourceMethodDispatchProvider{

    @Override
    protected InjectableValuesProvider getInjectableValuesProvider(AbstractResourceMethod abstractResourceMethod) {
        System.out.println("DispatchProvider ->> " + abstractResourceMethod);
        return null;
    }
}